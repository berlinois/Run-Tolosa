# Run Tolosa : consignes pour Claude

- Échanges et documentation en **français**.
- **README, section « Features »** : la mettre à jour à **chaque** nouvelle feature.
  - Une **grosse feature** = une puce de premier niveau, avec son statut
    (✅ fait · 🧪 en test · ⏳ prévu · 💡 idée).
  - Ses **sous-features** = des sous-puces indentées sous elle.
  - Pas de tableau : uniquement des listes à puces imbriquées.
- `docs/ARCHITECTURE.md` décrit l'architecture, le modèle de données et l'algorithme : le tenir à jour.
- Chaque push sur la branche par défaut publie une Release (APK installé via Obtainium).
  Pour un commit qui ne doit **pas** produire de version (doc, travail intermédiaire),
  ajouter `[skip ci]` au message.
