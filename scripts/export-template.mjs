// Writes the template with XO's own serializer (bigints kept) so blaze.xo.cash and any XO wallet import it under the same identifier.
import { writeFileSync } from 'node:fs';
import { serializeTemplate, generateTemplateIdentifier, parseTemplate } from '@xo-cash/utils';
import { tokenVaultTemplate } from '../template/tokenvault.template.mjs';
const json = serializeTemplate(tokenVaultTemplate);
writeFileSync(new URL('../template/tokenvault.template.json', import.meta.url), json + '\n');
console.log('template id', generateTemplateIdentifier(parseTemplate(json)));
