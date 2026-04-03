# GitHub Sidebar: Repo Organizer

Extension Chrome/Firefox qui remplace la liste native de repos GitHub par une sidebar organisable en dossiers avec drag & drop.

## Fonctionnalités

- Import automatique de tous les repos depuis la sidebar GitHub au chargement
- Organisation en dossiers, réordonnement par drag & drop
- Ajout de repos non personnels
- Création de dossier
- Thème adaptatif
- Sauvegarde locale automatique
- Export/import JSON

## Installation

**Firefox**
1. Ouvrir `about:debugging#/runtime/this-firefox`
2. Cliquer "Charger un module complémentaire temporaire"
3. Sélectionner `manifest.json`

**Chrome**
1. Ouvrir `chrome://extensions`, activer le mode développeur
2. Cliquer "Charger l'extension non empaquetée"
3. Sélectionner ce dossier (utiliser `manifest.chrome.json` renommé en `manifest.json`)

## Développement

Après modification, recharger l'extension depuis `about:debugging` (Firefox) ou `chrome://extensions` (Chrome).

## Stockage

Les données sont sauvegardées dans `chrome.storage.local` sous la clé `folders`. Tableau de dossiers contenant chacun une liste de repos `{ id, name, url, addedAt }`.
