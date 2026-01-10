# 📱 ETF Guardian - Build Automatico iOS

## 🔄 Come Funziona

1. **Push su GitHub** → GitHub Actions si attiva automaticamente
2. **Build nel Cloud** → Usa server macOS di GitHub (gratuiti!)
3. **Download IPA** → Scarichi il file `.ipa` dalla scheda Actions
4. **Installazione** → Usi AltStore/Sideloadly per installare su iPhone

## ⚙️ Configurazione

### 1. Secrets su GitHub
Vai su `Settings > Secrets and variables > Actions` e aggiungi:
- `EXPO_USERNAME`: La tua email di Expo
- `EXPO_PASSWORD`: La tua password di Expo
- `EXPO_PUBLIC_FIREBASE_API_KEY`: La tua Firebase API key
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: Il tuo sender ID
- `EXPO_PUBLIC_FIREBASE_APP_ID`: Il tuo Firebase app ID

### 2. Trigger Automatico
Il workflow si attiva:
- Automaticamente su ogni push al branch `main`
- Manualmente dalla scheda Actions

## 📥 Come Installare l'App

### Metodo 1: AltStore (iPhone)
1. Installa AltStore dal tuo iPhone
2. Scarica l'IPA da GitHub Actions
3. Apri AltStore e installa l'IPA

### Metodo 2: Sideloadly (PC/Mac)
1. Scarica Sideloadly su PC/Mac
2. Connetti il tuo iPhone
3. Installa l'IPA scaricato

## ⚠️ Limitazioni

- **7 giorni**: L'app scade dopo 7 giorni (limitazione Apple)
- **Non firmata**: Non puoi pubblicare su App Store
- **1 dispositivo**: Solo su dispositivi specifici

## 🚀 Comandi Utilici

### Build Locale (se vuoi testare)
```bash
npx eas build --platform ios --profile development
```

### Start Sviluppo
```bash
npx expo start
```

## 🔧 Troubleshooting

### Build fallisce?
- Controlla che tutti i secrets siano configurati
- Verifica che `expo-dev-client` sia installato
- Controlla il log nella scheda Actions

### Installazione fallisce?
- Assicurati di avere AltStore/Sideloadly installato
- Verifica che il tuo iPhone sia fidato
- Riavvia l'iPhone e riprova

## 💡 Pro Tip

Per testare rapidamente senza build:
1. Usa `npx expo start`
2. Scansiona il QR code con Expo Go
3. Molto più veloce per lo sviluppo!
