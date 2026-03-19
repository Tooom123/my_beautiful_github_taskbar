# GitHub Sidebar Organizer

Extension navigateur pour organiser ses repos GitHub en dossiers.

## Fonctionnalités

- 📁 Organiser les repos en dossiers personnalisés
- ↕️ Réordonner par drag & drop ou boutons ↑↓
- ✏️ Renommer dossiers et repos (double-clic)
- 🌗 Compatible dark mode / light mode GitHub
- 💾 Sauvegarde locale automatique
- 📤 Export / Import JSON

## Installation (développement)

### Chrome
1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (toggle en haut à droite)
3. Cliquer **"Charger l'extension non empaquetée"**
4. Sélectionner ce dossier
5. Aller sur github.com

### Firefox
1. Ouvrir `about:debugging#/runtime/this-firefox`
2. Cliquer **"Charger un module complémentaire temporaire"**
3. Sélectionner le fichier `manifest.json`

## Développement

Après chaque modification :
- **Chrome** : cliquer l'icône ↺ sur la carte de l'extension dans `chrome://extensions`
- **Firefox** : l'extension se recharge automatiquement

Logs du content script : Clic droit sur github.com → Inspecter → Console
Logs du background : `chrome://extensions` → cliquer "Service worker" de l'extension

## Générer les icônes

Les icônes PNG incluses sont des placeholders. Pour générer les vraies icônes :

```bash
npm install canvas
node generate-icons.js
```

## Structure des données (chrome.storage.local)

```json
{
  "folders": [
    {
      "id": "uuid-v4",
      "name": "Mon projet",
      "collapsed": false,
      "repos": [
        {
          "id": "facebook/react",
          "name": "facebook/react",
          "url": "https://github.com/facebook/react",
          "addedAt": 1709123456789
        }
      ]
    }
  ],
  "preferences": {
    "position": "right",
    "startCollapsed": false,
    "filterByOrg": false
  }
}
```

## Construire pour production

```bash
zip -r github-sidebar-organizer.zip . \
  --exclude "*.git*" \
  --exclude "node_modules/*" \
  --exclude "generate-icons.js"
```