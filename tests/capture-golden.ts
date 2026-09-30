// Regenerates tests/golden/*.json from the current code: `npm run golden`.
import * as fs from 'fs'
import * as path from 'path'
import { captureAll, serialize, GOLDEN } from './capture'

captureAll().then(all => {
  for (const [name, value] of Object.entries(all)) {
    fs.writeFileSync(path.join(GOLDEN, `${name}.json`), serialize(value))
  }
})
