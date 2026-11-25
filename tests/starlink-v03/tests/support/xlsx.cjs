'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const fixture = path.join(__dirname, 'workbook_fixture.py');

function python(mode, input) {
  let result = spawnSync(process.env.PYTHON || 'python3', [fixture, mode], {input});
  if (!process.env.PYTHON && process.platform === 'win32' && result.error?.code === 'ENOENT') {
    result = spawnSync('py', ['-3', fixture, mode], {input});
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}

function workbook(sheets, compressed = true) {
  return new Blob([python('xlsx', JSON.stringify({sheets, compressed}))]);
}

// Node has no global DOMParser. ElementTree parses each XML part. This adapter
// supplies the DOM traversal methods used by the browser workbook reader.
class Element {
  constructor(node, parentNode = null) {
    this.localName = node.name;
    this.textContent = node.text;
    this.parentNode = parentNode;
    this.attributes = node.attributes.map(([localName, value]) => ({localName, value}));
    this.children = node.children.map(child => new Element(child, this));
  }

  getAttribute(name) {
    return this.attributes.find(attribute => attribute.localName === name)?.value ?? null;
  }

  getElementsByTagNameNS(namespace, name) {
    return this.children.flatMap(child => {
      const descendants = child.getElementsByTagNameNS(namespace, name);
      return child.localName === name ? [child, ...descendants] : descendants;
    });
  }
}

class DOMParser {
  parseFromString(xml) {
    const root = JSON.parse(python('xml', xml));
    return new Element({name: '#document', text: '', attributes: [], children: [root]});
  }
}

module.exports = {workbook, DOMParser};
