const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'node_modules', '@ledgerhq', 'errors', 'lib-es', 'index.js');
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf-8');
  if (content.includes('from "./helpers"') && !content.includes('from "./helpers.js"')) {
    content = content.replace(/from "\.\/helpers"/g, 'from "./helpers.js"');
    fs.writeFileSync(file, content);
    console.log('Patched @ledgerhq/errors/lib-es/index.js');
  }
}
