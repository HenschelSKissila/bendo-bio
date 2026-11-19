# BENDO BIO — Boutique en ligne & gestion opérationnelle (v1.6)

**BENDO BIO** — Ngoyo centrale, Pointe-Noire, République du Congo · 📞 +242 06 606 70 58 · ✉️ bendobio@gmail.com
Application créée par **Henschel**. © BENDO BIO — tous droits réservés.

> **Mise à jour v1.2** (notifications clients, livreurs, QR) : exécutez `007_notifications_qr.sql` puis
> `008_livreurs.sql` (deux requêtes séparées dans le SQL Editor), puis configurez l'envoi push (§ 8).
>
> **Base déjà installée (scripts 001 à 005 exécutés) ?** Exécutez seulement `supabase/migrations/006_correctifs_congo.sql`
> dans le SQL Editor : il corrige la réception de stock et les commandes, applique les paramètres Congo (FCFA,
> Africa/Brazzaville, quartiers de Pointe-Noire, contacts) et les correctifs de la revue de code.

Application web progressive (PWA, installable sur smartphone) conforme au cahier des charges v1.0 :
boutique publique, commandes, clients, créneaux de livraison/retrait, **stock par lots (FEFO)**,
alertes automatiques, rapports/exports CSV, rôles Client / Employé / Administrateur, journal d'audit.

| Couche | Choix |
|---|---|
| Interface | React 18 + TypeScript + Vite + Tailwind, PWA (vite-plugin-pwa) |
| Base de données / API / Auth | Supabase (PostgreSQL, Row Level Security, Realtime, Storage) |
| Hébergement | Netlify (`netlify.toml` inclus) |
| Règles critiques | **Côté serveur**, en fonctions PostgreSQL transactionnelles (stock, prix, capacité, statuts) |

---

## 1. Mise en place de la base Supabase (≈ 5 minutes)

1. Ouvrez votre projet Supabase → **SQL Editor** → *New query*.
2. Copiez-collez puis exécutez **dans l'ordre** :
   1. `supabase/migrations/001_schema.sql` — tables
   2. `supabase/migrations/002_functions.sql` — règles métier
   3. `supabase/migrations/003_security_realtime.sql` — sécurité RLS, temps réel, stockage photos
   4. `supabase/migrations/004_seed_and_cron.sql` — catégories, 9 produits d'exemple, zone, créneaux, tâches automatiques
   5. `supabase/migrations/005_grants.sql` — droits d'accès de l'API (**obligatoire** sur les projets Supabase récents, sinon « permission denied for table »)
   6. `supabase/migrations/006_correctifs_congo.sql` — correctifs + paramètres Congo (Pointe-Noire, FCFA, contacts)
   7. `supabase/migrations/007_notifications_qr.sql` — notifications clients, suivi de livraison, QR de traçabilité
   8. `supabase/migrations/008_livreurs.sql` — rôle livreur et demandes d'accès (à exécuter **séparément** du 007)
   9. `supabase/migrations/009_compteurs_menu.sql` — compteurs de nouveautés dans le menu de gestion
  10. `supabase/migrations/010_code_livraison_messagerie.sql` — code de livraison client + messagerie / promotions
   
   Les scripts sont ré-exécutables sans risque.
3. *(Recommandé)* **Database → Extensions → pg_cron** : activez-la **avant** le script 004 (ou ré-exécutez 004 après).
   Sans pg_cron, les tâches (réservations expirées, alertes DLC, génération des créneaux, rappels) sont lancées
   automatiquement à chaque ouverture du tableau de bord.
4. **Authentication → URL Configuration** : *Site URL* = l'adresse Netlify (ex. `https://bendo-bio.netlify.app`)
   et ajoutez-la dans *Redirect URLs* (nécessaire pour la confirmation d'e-mail et le mot de passe oublié).

## 2. Identifiants de connexion — création de l'administrateur

Aucun mot de passe n'est écrit dans le code (exigence §10.2). Le premier accès se fait ainsi :

1. Ouvrez l'application → **/installation** (lien « Première installation » sur la page de connexion).
2. Créez votre compte (e-mail + mot de passe ≥ 8 caractères), confirmez l'e-mail si Supabase le demande.
3. Reconnectez-vous, retournez sur **/installation** → **« Devenir administrateur »**.
   Cette action n'est possible **qu'une seule fois** : dès qu'un administrateur existe, elle est bloquée.
4. **Employés** : chaque employé crée son propre compte, puis l'admin lui attribue le rôle *Employé*
   dans **Gestion → Utilisateurs** (un compte par personne, désactivation immédiate possible).

> Astuce test : dans Supabase → Authentication → Providers → Email, vous pouvez désactiver temporairement
> « Confirm email » pour aller plus vite pendant les essais.

## 3. Déploiement Netlify

1. Netlify → *Add new site* → *Import from Git* → ce dépôt GitHub, branche voulue.
2. Les réglages sont lus depuis `netlify.toml` (build `npm run build`, dossier `dist`, redirection SPA, en-têtes de sécurité).
3. *(Optionnel)* **Site configuration → Environment variables** : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
   Sans elles, l'application utilise le projet `yrpwtexcsmioecupfuze` configuré par défaut.
   La clé *publishable* est publique par conception : la sécurité repose sur les règles RLS de la base.
   **Ne mettez jamais la clé `service_role` / `secret` dans l'application.**

Développement local :
```bash
npm install
```
```bash
npm run dev
```

## 4. Vérifier le lien avec la base

- **Pastille permanente** (barre latérale de la gestion) : vert = base connectée + latence, orange = scripts SQL
  non exécutés, rouge = injoignable. Ping automatique toutes les 30 s.
- **Gestion → Paramètres → « Connexion à la base de données »** : bouton *Tester maintenant* qui vérifie l'URL, la clé,
  la latence API, le websocket temps réel, la session, l'heure serveur, la version du schéma, RLS activée partout,
  les tables publiées en temps réel, pg_cron, la dernière exécution des tâches, la file des notifications
  et l'accès à chaque table (temps de réponse).
- **Temps réel** : commandes, stocks, lots, alertes et créneaux se mettent à jour sans recharger la page ;
  une notification apparaît dans la gestion à chaque nouvelle commande.

## 5. Suivi des stocks — méthode proposée

Pour des produits frais majoritairement **non préemballés** (tomates, oignons, légumes en vrac), un code-barres
par article n'a pas de sens. La solution retenue :

| Cas | Identification | Usage |
|---|---|---|
| Produits en vrac / au poids | **QR code par LOT**, imprimé automatiquement à la réception, collé sur le bac / la cagette | Scan → sortie, perte, inventaire, blocage, traçabilité du lot |
| Produits préemballés (œufs, épicerie) | **Code-barres EAN** du fabricant, saisi dans la fiche produit | Scan → fiche produit + lots |
| Sans étiquette | Recherche par nom / SKU / n° de lot | Même actions |

- Scanner avec la **caméra du smartphone** (Gestion → Scanner) ou une **douchette USB/Bluetooth** (~30–60 €).
- Étiquettes au format 62 mm (imprimante thermique type Brother QL, ~100 €) ou sur feuille A4.
- **Stock physique / réservé / disponible** distincts ; sortie **FEFO** automatique (date limite la plus proche d'abord) ;
  lot échu ou bloqué jamais vendu ; journal des mouvements **immuable** ; inventaire avec écarts tracés ;
  alertes stock bas / critique / DLC **une seule fois** par situation (pas de spam).

## 6. Correspondance avec le cahier des charges

| Exigence | Implémentation |
|---|---|
| WEB-01…08 boutique | Accueil, rayons, recherche/filtres, fiche (allergènes, conservation, origine), indispo signalée, totaux dynamiques, frais/min. affichés avant validation |
| §4.3 Réservation atomique / T03-T04 | `place_order` verrouille les produits et le créneau (`FOR UPDATE`) : testé avec 3 achats simultanés de la dernière unité → 1 seul réussit |
| §4.4 Statuts contrôlés | `set_order_status` : matrice de transitions, motif obligatoire (annulation, échec, remboursement), décision de remise en stock après préparation |
| T05/T06 Paiement | `confirm_payment` idempotent (même référence reçue 2 fois = 1 seul paiement) ; `fail_payment` libère la réservation |
| §5.4 Créneaux | Modèle hebdomadaire, génération 14 j, capacité, délai de préparation, heure limite du jour, jours fermés, blocage, déplacement avec notification, rappel la veille |
| §5.5 Livraison | Zones par codes postaux, frais, minimum, gratuité, consignes, départ/remise horodatés, échec avec motif |
| STK-01…10 | Voir §5 ci-dessus + exports CSV |
| §5.7 Tableau de bord | « Aujourd'hui » : à préparer, créneaux du jour, retards, CA, alertes |
| §3 Rôles | RLS + vérifications serveur ; prix/seuils réservés à l'admin (bloqué en base) |
| §7.1 Intégrité | Instantané nom/prix/unité dans les lignes, commande livrée non supprimable, n° non prédictibles, montants calculés serveur |
| §11.2 RGPD | Consentements séparés, demandes accès/rectification/effacement, anonymisation conservant les pièces légales |
| §11.3 Traçabilité | Lot ↔ commandes (rappel de lot : liste des clients concernés) |

Tests : `supabase/tests/scenario.sql` puis `supabase/tests/review_fixes.sql` (base locale préparée avec `local_auth_stub.sql`, qui simule un projet Supabase récent ; jamais en production).

## 7. Ce qui reste à décider / brancher

- **Paiement en ligne** : en attente du pays et du prestataire (Stripe, CinetPay, Flutterwave…). La v1 propose
  espèces / mobile money à la remise ; le flux « en attente de paiement + réservation 15 min + confirmation idempotente »
  est déjà en place pour brancher le webhook.
- **E-mails** : les notifications sont mises en file dans la table `notifications`. Pour l'envoi réel, déployez
  `supabase/functions/send-notifications` (Resend) et planifiez-la toutes les 2 minutes. SMS/WhatsApp : en option.
- **Textes légaux** (mentions, CGV, confidentialité) : champs à compléter dans Paramètres, à faire valider.
- Codes promo, fidélité, multi-entrepôts : P1/P2, hors v1.

## 8. Notifications sur le téléphone (push)

Chaque étape d'une commande (confirmée, en préparation, prête, en livraison, livreur dans le quartier, livrée
avec date/heure et personne qui a reçu, paiement reçu, message de l'équipe) est enregistrée dans le
**centre de notifications** du client (cloche 🔔, temps réel). Pour qu'elle arrive aussi **sur le téléphone,
site fermé**, l'utilisateur touche « Autoriser les notifications » ; le site l'envoie via la fonction
`supabase/functions/send-push` (Web Push, gratuit).

Mise en place (une fois) : créer la fonction `send-push` dans Supabase > Edge Functions (éditeur en ligne),
renseigner les secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`, puis enregistrer l'URL
de la fonction dans la table `app_secrets`. Les valeurs exactes sont dans le document privé fourni à part
(jamais sur GitHub). Vérification : Gestion > Paramètres > « Notifications push ».

- Android (Chrome) : fonctionne directement.
- iPhone (iOS 16.4+) : ajouter d'abord le site à l'écran d'accueil (Partager > Sur l'écran d'accueil).

## 9. Livreurs

- À l'inscription, la personne choisit **Client / Livreur / Gestionnaire**. Livreur et gestionnaire restent
  en attente (compte client) jusqu'à validation dans **Gestion > Utilisateurs**.
- Espace **/livreur** : livraisons à prendre (quartier, créneau, frais de livraison, valeur de la marchandise,
  montant à encaisser), prise en charge en un geste — la livraison disparaît aussitôt chez les autres —,
  mes livraisons (adresse et téléphone révélés seulement au livreur qui l'a prise), historique et gains.
- Actions : récupérée / en cours, « je suis dans le quartier », livrée (remise à…), échec, argent encaissé.
- Notifications livreurs : nouvelle livraison disponible, commande prête à récupérer, livraison annulée.
- L'équipe peut aussi attribuer une livraison à un livreur depuis la fiche commande.

## 10. Étiquettes et QR codes

Le QR code contient une **adresse web** : n'importe quel téléphone qui le scanne ouvre la fiche de
traçabilité du lot (produit, lot, date limite, origine, conservation). Un employé connecté y trouve les
actions de stock. Formats : étiquette QR (bac, cagette, sachet), étiquette simple sans QR (logo + référence +
date limite) et étiquette colis (QR de suivi pour le client). Les produits en vrac ne sont pas étiquetés
individuellement : on étiquette le contenant du lot.

## 11. Compteurs du menu de gestion

Chaque rubrique du panneau de gauche affiche des pastilles : **rouge** = nouveau depuis votre dernière visite
(commandes, clients inscrits, articles ajoutés, réceptions de stock), **orange** = à traiter (commandes à
préparer, demandes d'accès livreur/gestionnaire, alertes, demandes RGPD). Les compteurs sont propres à chaque
membre de l'équipe, enregistrés en base (identiques sur ordinateur et téléphone) et mis à jour en temps réel.
La page « Aujourd'hui » résume « Depuis votre dernière visite » et « À traiter » ; les nouveaux éléments sont
marqués « Nouveau » dans les listes. Chaque nouvelle inscription déclenche aussi une notification à l'équipe.

## 12. Code de livraison (preuve de remise)

Au départ en livraison, un code de 6 caractères (chiffres + lettres, sans 0/O ni 1/I) est tiré par le
générateur aléatoire cryptographique du serveur et envoyé **uniquement au client** (notification, compte,
page de suivi), avec l'avertissement de ne jamais le communiquer par téléphone. Le livreur ne le voit jamais :
il doit le saisir pour valider « Livrée ». 5 erreurs → code bloqué et alerte à l'équipe. L'administrateur peut
confirmer exceptionnellement sans code, avec un motif obligatoire enregistré.

## 13. Messagerie

- Client : page **Messages** (disponibilité d'un produit, demande hors catalogue, question) et onglet
  **Promotions & infos** ; bouton « Demander quand il sera disponible » sur les produits en rupture.
- Équipe : rubrique **Messagerie** (conversations, pastille des messages non lus, réponse notifiée) et
  **annonces / promotions** envoyées en notification : aux clients ayant accepté les offres, ou à tous pour
  une information de service. La dernière annonce s'affiche sur la page d'accueil.

## 14. Mode nuit

Bouton 🖥️/☀️/🌙 dans l'en-tête (boutique, gestion, espace livreur) et choix dans « Mon compte » et
« Paramètres » : **Auto** (par défaut — suit le réglage clair/sombre du téléphone ou de l'ordinateur),
**Clair** ou **Sombre**. Le choix est mémorisé sur l'appareil ; impressions et étiquettes restent claires.
