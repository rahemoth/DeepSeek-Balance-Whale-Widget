import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.dirname(desktop)
const target = path.join(desktop, 'vendor')
fs.mkdirSync(target, { recursive: true })
for (const name of ['lib', 'assets', 'package.json', 'icon.png', 'LICENSE', 'PROVENANCE.md']) {
  fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true })
}
console.log('已复制完整原版界面、宿主、资源与来源说明。')
