/**
 * SEO keywords for Code-UP.
 * HTML meta tags use TOP_META_KEYWORDS / SEO_KEYWORD_MATRIX (small topical set).
 */

import { buildPriorityKeywordMatrix, TOP_META_KEYWORDS as TOP } from "@/lib/geo-phrases";

export const TOP_META_KEYWORDS = [...TOP];

export const SEO_KEYWORD_MATRIX = buildPriorityKeywordMatrix();
