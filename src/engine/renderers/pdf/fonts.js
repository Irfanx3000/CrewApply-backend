'use strict';

const path = require('path');

// pdfmake ships its own default Roboto TTFs — reused as-is rather than
// bundling/managing separate font assets. Server-side pdfmake (0.3.x) needs
// real file paths per weight/style, unlike the browser build's base64 vfs.
const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

const FONTS = {
  Roboto: {
    normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
    bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
  },
};

module.exports = { FONTS };
