#!/usr/bin/env node

/**
 * Code-UP Axinom Multi-DRM Video Packaging & Encryption Utility.
 * Encrypts raw MP4 videos into Common Encryption (CENC) DASH/HLS segments with Widevine & PlayReady PSSH,
 * and safely deletes the original raw MP4 only after verifying non-empty encrypted outputs.
 *
 * Renditions are split across two content keys so that both hardware and
 * software DRM devices can play, without handing full quality to the weaker
 * one:
 *
 *   HD tier -> its own key, licensed only to hardware-backed CDMs (L1/SL3000)
 *   SD tier -> its own key, licensed to software CDMs (L3/SL2000) as well
 *
 * A software device is never issued the HD key, so Shaka simply drops the HD
 * renditions for it. Anything captured on an L3 machine is SD.
 *
 * Usage:
 *   node scripts/encrypt-video.js <input-video.mp4> <assetId> [--delete-raw] [--single-key]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DRM_OUTPUT_DIR = path.resolve(process.cwd(), 'uploads', 'drm');
const DRM_KEYS_DIR = path.resolve(process.cwd(), 'uploads', 'drm-keys');

function generateDrmKeys() {
  const keyId = crypto.randomBytes(16).toString('hex');
  const key = crypto.randomBytes(16).toString('hex');
  return { keyId, key };
}

/** Rendition tiers. Height is the target; the source is never upscaled. */
const TIERS = [
  { label: 'SD', height: 480, crf: 24, hardwareOnly: false },
  { label: 'HD', height: 1080, crf: 21, hardwareOnly: true },
];

function findBinary(names) {
  for (const name of names) {
    try {
      const check = spawnSync(name, ['-version'], { stdio: 'ignore' });
      if (check.status === 0) return name;
    } catch {
      // not in path
    }
  }
  return null;
}

function probeHeight(ffprobeBin, inputFile) {
  if (!ffprobeBin) return null;
  const out = spawnSync(ffprobeBin, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=height',
    '-of', 'csv=p=0',
    inputFile,
  ], { encoding: 'utf-8' });
  const height = Number.parseInt((out.stdout || '').trim(), 10);
  return Number.isFinite(height) ? height : null;
}

/** Transcodes one video-only rendition. Returns the output path. */
function buildRendition(ffmpegBin, inputFile, outputDir, tier) {
  const target = path.join(outputDir, `source_${tier.label.toLowerCase()}.mp4`);
  const result = spawnSync(ffmpegBin, [
    '-y',
    '-i', inputFile,
    '-an',
    '-vf', `scale=-2:${tier.height}`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-crf', String(tier.crf),
    '-preset', 'fast',
    target,
  ], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`
Transcode failed for ${tier.label} tier (exit ${result.status}).`);
    process.exit(result.status || 1);
  }
  return target;
}

function findPackagerBinary() {
  const customPath = process.env.SHAKA_PACKAGER_PATH;
  if (customPath && fs.existsSync(customPath)) return customPath;

  const standardNames = process.platform === 'win32'
    ? ['packager.exe', 'packager-win-x64.exe', 'packager']
    : ['packager', 'packager-linux-x64', 'shaka-packager'];

  for (const name of standardNames) {
    try {
      const check = spawnSync(name, ['--version'], { stdio: 'ignore' });
      if (check.status === 0 || check.error === undefined) {
        return name;
      }
    } catch {
      // not in path
    }
  }

  // Check local project binary folder
  const localBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'packager.exe' : 'packager');
  if (fs.existsSync(localBin)) return localBin;

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Code-UP DRM Packager');
    console.log('Usage: node scripts/encrypt-video.js <input.mp4> <assetId> [--delete-raw]');
    process.exit(1);
  }

  const inputFile = path.resolve(args[0]);
  const assetId = args[1].trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const deleteRaw = args.includes('--delete-raw');
  const singleKey = args.includes('--single-key');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file does not exist: ${inputFile}`);
    process.exit(1);
  }

  const outputDir = path.join(DRM_OUTPUT_DIR, assetId);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(DRM_KEYS_DIR)) {
    fs.mkdirSync(DRM_KEYS_DIR, { recursive: true });
  }

  const packagerBin = findPackagerBinary();
  const { keyId, key } = generateDrmKeys();

  console.log(`\n========================================`);
  console.log(` Code-UP Hardware Multi-DRM Packaging `);
  console.log(`========================================`);
  console.log(`Input File:  ${inputFile}`);
  console.log(`Asset ID:    ${assetId}`);
  console.log(`Output Dir:  ${outputDir}`);
  console.log(`DRM Key ID:  ${keyId}`);
  console.log(`DRM Key:     ${key}`);

  if (!packagerBin) {
    console.warn(`\n[Notice] Shaka Packager CLI not found in PATH.`);
    console.log(`To install Shaka Packager on Linux (t3.medium):`);
    console.log(`  sudo wget https://github.com/shaka-project/shaka-packager/releases/latest/download/packager-linux-x64 -O /usr/local/bin/packager && sudo chmod +x /usr/local/bin/packager`);
    console.log(`\nSaving DRM asset metadata for when packager is invoked...`);

    const meta = {
      assetId,
      keyId,
      key,
      status: 'pending_packaging',
      source: inputFile,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(DRM_KEYS_DIR, `${assetId}.json`), JSON.stringify(meta, null, 2));
    console.log(`Saved private metadata to ${path.join(DRM_KEYS_DIR, `${assetId}.json`)}`);
    return;
  }

  console.log(`\nEncrypting and packaging DASH + HLS with Shaka Packager (Widevine + PlayReady)...`);

  const manifestPath = path.join(outputDir, 'manifest.mpd');
  const hlsPath = path.join(outputDir, 'master.m3u8');
  const videoOut = path.join(outputDir, 'video.mp4');
  const audioOut = path.join(outputDir, 'audio.mp4');

  const ffmpegBin = findBinary(['ffmpeg']);
  const ffprobeBin = findBinary(['ffprobe']);

  // Tiered packaging needs real renditions, so it requires ffmpeg. Without it
  // we fall back to the original single-key behaviour rather than failing.
  const tiered = !singleKey && Boolean(ffmpegBin);
  if (!singleKey && !ffmpegBin) {
    console.warn('\n[Notice] ffmpeg not found — falling back to single-key packaging.');
    console.warn('         Install ffmpeg to split HD/SD across separate DRM keys.');
  }

  const packagerArgs = [];
  const tierKeys = [];

  if (tiered) {
    const sourceHeight = probeHeight(ffprobeBin, inputFile);
    const usableTiers = TIERS.filter(
      (tier) => !sourceHeight || tier.height <= sourceHeight || tier.label === 'SD'
    );

    for (const tier of usableTiers) {
      const rendition = buildRendition(ffmpegBin, inputFile, outputDir, tier);
      const tierKey = generateDrmKeys();
      tierKeys.push({ ...tierKey, label: tier.label, height: tier.height, hardwareOnly: tier.hardwareOnly });
      packagerArgs.push(
        `in=${rendition},stream=video,output=${path.join(outputDir, `video_${tier.label.toLowerCase()}.mp4`)},drm_label=${tier.label}`
      );
    }
    // Audio rides on the SD key so software devices still get sound.
    packagerArgs.push(`in=${inputFile},stream=audio,output=${audioOut},drm_label=SD`);
    packagerArgs.push('--enable_raw_key_encryption');
    packagerArgs.push(
      `--keys=${tierKeys.map((t) => `label=${t.label}:key_id=${t.keyId}:key=${t.key}`).join(',')}`
    );
  } else {
    tierKeys.push({ keyId, key, label: 'SD', height: null, hardwareOnly: false });
    packagerArgs.push(`in=${inputFile},stream=video,output=${videoOut}`);
    packagerArgs.push(`in=${inputFile},stream=audio,output=${audioOut}`);
    packagerArgs.push('--enable_raw_key_encryption');
    packagerArgs.push(`--keys=label=:key_id=${keyId}:key=${key}`);
  }

  packagerArgs.push(
    '--protection_systems=Widevine,PlayReady',
    '--protection_scheme=cenc',
    `--mpd_output=${manifestPath}`,
    `--hls_master_playlist_output=${hlsPath}`
  );

  const result = spawnSync(packagerBin, packagerArgs, { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(`\nPackaging failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }

  // Verify that required encrypted outputs exist and are non-empty
  const manifestExists = fs.existsSync(manifestPath) && fs.statSync(manifestPath).size > 0;
  const expectedVideos = tiered
    ? tierKeys.map((t) => path.join(outputDir, `video_${t.label.toLowerCase()}.mp4`))
    : [videoOut];
  const videoExists = expectedVideos.every(
    (file) => fs.existsSync(file) && fs.statSync(file).size > 0
  );

  if (!manifestExists || !videoExists) {
    console.error(`\nPackaging verification failed: generated outputs are missing or empty.`);
    process.exit(1);
  }

  // Save private metadata securely outside served directory
  const meta = {
    assetId,
    // Legacy single-key fields, kept so already-packaged assets keep working.
    keyId: tierKeys[0].keyId,
    key: tierKeys[0].key,
    tiered,
    keys: tierKeys,
    manifest: `/api/videos/drm/${assetId}/manifest.mpd`,
    hlsMaster: `/api/videos/drm/${assetId}/master.m3u8`,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(DRM_KEYS_DIR, `${assetId}.json`), JSON.stringify(meta, null, 2));

  console.log(`\nEncrypted DASH Manifest: ${manifestPath}`);
  console.log(`Encrypted HLS Playlist:  ${hlsPath}`);

  // The transcoded mezzanines are only inputs to the packager.
  for (const tier of tierKeys) {
    const rendition = path.join(outputDir, `source_${tier.label.toLowerCase()}.mp4`);
    if (fs.existsSync(rendition)) {
      try {
        fs.unlinkSync(rendition);
      } catch (e) {
        console.warn(`Could not remove intermediate ${rendition}: ${e.message}`);
      }
    }
  }

  // Storage optimization: sync encrypted segments to AWS S3 and clean up
  const s3Bucket = process.env.AWS_S3_STORAGE_BUCKET || 'codeup-storage-687374520011';
  try {
    console.log(`Syncing encrypted video segments to S3 (s3://${s3Bucket}/videos/drm/${assetId}/)...`);
    const s3Sync = spawnSync('aws', ['s3', 'sync', outputDir, `s3://${s3Bucket}/videos/drm/${assetId}/`, '--region', 'eu-north-1'], { stdio: 'inherit' });
    if (s3Sync.status === 0) {
      console.log(`Successfully synced encrypted video to S3.`);
    }
  } catch (s3Err) {
    console.warn(`Could not sync to S3: ${s3Err.message}`);
  }

  // Storage optimization: delete original raw MP4 only if requested and verified
  if (deleteRaw) {
    try {
      fs.unlinkSync(inputFile);
      console.log(`Cleaned up raw MP4 file to preserve server storage.`);
    } catch (e) {
      console.warn(`Could not delete raw MP4: ${e.message}`);
    }
  } else {
    console.log(`Original MP4 preserved at: ${inputFile} (Pass --delete-raw to remove)`);
  }

  console.log(`\nSuccess! Video is now 100% DRM-protected and ready for playback.\n`);
}

main().catch((err) => {
  console.error('Fatal packaging error:', err);
  process.exit(1);
});
