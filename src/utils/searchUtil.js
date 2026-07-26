'use strict';

// Escapes regex metacharacters so free-text search input can be safely
// embedded in a RegExp without behaving like a pattern (e.g. a literal ".").
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "contains" regex for a trimmed search term.
const buildRegex = (term) => new RegExp(escapeRegex(term.trim()), 'i');

module.exports = { escapeRegex, buildRegex };
