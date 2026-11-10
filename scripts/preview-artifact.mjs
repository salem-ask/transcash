// Prépare la prévisualisation (artefact claude.ai) à partir de preview/index.html (mode démo, fichier unique).
// Le service d'artefacts ajoute lui-même <!doctype>, <html>, <head> et <body> : on ne garde que le contenu.
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('preview/index.html', 'utf8')
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
const keep = head
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '')
// Le script du module doit s'exécuter après la création de #root
const scripts = [...keep.matchAll(/<script\b[\s\S]*?<\/script>/g)].map((m) => m[0])
const rest = keep.replace(/<script\b[\s\S]*?<\/script>/g, '')
writeFileSync('preview/artifact.html', `${rest.trim()}\n${body.trim()}\n${scripts.join('\n')}\n`)
console.log('preview/artifact.html prêt')
