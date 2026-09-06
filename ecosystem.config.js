module.exports = {
  apps: [{
    name: 'Thefake',
    script: 'server.js',
    cwd: '/home/ec2-user/Thefake',
    instances: 1,
    exec_mode: 'fork',
    node_args: '--max-old-space-size=1280',
    max_memory_restart: '1500M',

    // --- crash-loop guardrails (added after the 2026-09-02 reboot-loop incident) ---
    // When the .next build is missing, every worker throws on boot and exits(1).
    // Without these limits PM2 respawns instantly and pins both vCPUs at 100%,
    // which is what let the (now removed) watchdog OS-reboot fire in a loop.
    //   min_uptime            a worker must stay up 10s to count as a clean start;
    //                         anything shorter is an "unstable" restart.
    //   max_restarts          after 10 unstable restarts PM2 parks the process in
    //                         "errored" and stops respawning it.
    //   restart_delay         wait 4s between restarts so a broken build idles the
    //                         box instead of burning CPU. The watchdog can then
    //                         rebuild (or a human can SSH in) on a quiet machine.
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    autorestart: true,

    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
