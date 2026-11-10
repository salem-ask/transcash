// Copie l'API PHP dans dist/api pour un déploiement Hostinger en un seul dossier.
// Exclut config.php (secrets, créé directement sur le serveur) et les tests.
import { cpSync } from 'node:fs'

cpSync('api', 'dist/api', {
  recursive: true,
  filter: (src) => !/(^|[\\/])(config\.php|tests)$/.test(src),
})
console.log('API copiée dans dist/api (sans config.php)')
