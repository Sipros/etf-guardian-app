# 🧪 ETF Guardian - Test Scripts

## 📁 Scripts Disponibili

### 1️⃣ **check-system-status.js**
**Verifica completa dello stato del sistema:**
- 📱 Device tokens salvati in Firebase
- 📊 Massimi attuali di ogni asset
- 💰 Prezzi correnti real-time
- 📉 Drawdown calcolati
- 🚨 Alert recenti (ultime 24h)
- ⚡ Stato GitHub Actions

**Uso:**
```bash
cd test-scripts
node check-system-status.js
```

### 2️⃣ **test-notification.js**
**Invia notifica push di test:**
- 📱 Legge tutti i device token da Firebase
- 📤 Manda notifica test a tutti i dispositivi
- 📝 Logga il test in Firebase

**Uso:**
```bash
cd test-scripts
node test-notification.js
```

### 3️⃣ **simulate-github-actions.js**
**Simula esattamente GitHub Actions:**
- 📊 Fetch prezzi correnti da Yahoo Finance
- 📈 Aggiorna massimi in Firebase se necessario
- 📉 Calcola drawdown reali
- 🚨 Manda notifiche push se threshold superato
- 💾 Salva tutto in Firebase

**Uso:**
```bash
cd test-scripts
node simulate-github-actions.js
```

---

## 🎯 **Come Usare i Test**

### **Verifica Sistema Completo:**
```bash
# 1. Controlla stato attuale
node check-system-status.js

# 2. Simula GitHub Actions
node simulate-github-actions.js

# 3. Test notifiche
node test-notification.js
```

### **Cosa Verificare:**

✅ **Massimi Aggiornati?**
- GitHub Actions aggiorna i massimi quando i prezzi salgono
- Controlla `data_massimo` in Firebase

✅ **Prezzi Correnti?**
- Yahoo Finance API fornisce prezzi real-time
- Confronta con massimi per drawdown

✅ **Notifiche Funzionanti?**
- Device token salvati correttamente
- Push notifications ricevute sui dispositivi

✅ **GitHub Actions Attivo?**
- Ogni 5 minuti esegue il monitor
- Controlla tab GitHub Actions nel repository

---

## 📊 **Flusso Completo Sistema**

```
📱 APP (quando aperta)
├── 1. Ottiene device token
├── 2. Salva token in Firebase
└── 3. Mostra UI con dati reali

⚡ GITHUB ACTIONS (ogni 5 min)
├── 1. Legge massimi da Firebase
├── 2. Fetch prezzi Yahoo Finance
├── 3. Aggiorna massimi se prezzo > massimo
├── 4. Calcola drawdown reali
├── 5. Manda notifiche push
└── 6. Salva alert in Firebase

📱 DISPOSITIVI
├── 1. Riceve notifiche push
├── 2. Mostra alert drawdown
└── 3. Apre app per dettagli
```

## 🚨 **Troubleshooting**

### **Se non ci sono device token:**
1. Apri l'app su un dispositivo reale
2. Consenti notifiche
3. Controlla console per "Device Push Token"
4. Esegui `node check-system-status.js`

### **Se i massimi non si aggiornano:**
1. Esegui `node simulate-github-actions.js`
2. Controlla log per "Updated X peak to"
3. Verifica GitHub Actions nel repository

### **Se le notifiche non arrivano:**
1. Esegui `node test-notification.js`
2. Controlla device token trovati
3. Verifica app su dispositivo

---

**🎉 Tutti gli script sono pronti per testare il sistema completo!**
