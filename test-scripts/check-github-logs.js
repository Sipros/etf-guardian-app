const admin = require('firebase-admin');
const fs = require('fs');
const axios = require('axios');

// Load service account
const serviceAccount = JSON.parse(fs.readFileSync('C:\\Users\\Admin\\Downloads\\etf-guardian-firebase-adminsdk-fbsvc-03800b523d.json', 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

// Check GitHub Actions execution logs
async function checkGitHubActionsLogs() {
  console.log('🔍 CHECKING GITHUB ACTIONS EXECUTION LOGS');
  console.log('==========================================');
  
  try {
    // 1. Check recent price monitoring logs
    console.log('\n📊 RECENT PRICE MONITORING LOGS:');
    const logsSnapshot = await db.collection('github_actions_logs')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    if (logsSnapshot.empty) {
      console.log('❌ No GitHub Actions logs found');
      console.log('💡 GitHub Actions may not be running or logging');
    } else {
      console.log(`✅ Found ${logsSnapshot.size} recent execution(s):`);
      logsSnapshot.forEach((doc, index) => {
        const data = doc.data();
        const execTime = new Date(data.timestamp).toLocaleString();
        const hoursAgo = ((Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60)).toFixed(1);
        
        console.log(`\n   🚀 Execution #${logsSnapshot.size - index}:`);
        console.log(`      📅 Time: ${execTime}`);
        console.log(`      ⏰ ${hoursAgo} hours ago`);
        console.log(`      📊 Assets checked: ${data.assets_checked || 'N/A'}`);
        console.log(`      📈 Peaks updated: ${data.peaks_updated || 'N/A'}`);
        console.log(`      🚨 Alerts sent: ${data.alerts_sent || 'N/A'}`);
        console.log(`      ⏱️ Duration: ${data.duration || 'N/A'}s`);
        console.log(`      ✅ Status: ${data.status || 'N/A'}`);
      });
    }

    // 2. Check last execution time
    console.log('\n⏰ LAST EXECUTION ANALYSIS:');
    const lastExecution = await db.collection('github_actions_logs')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    let minutesSinceLast = 999; // Default value
    
    if (!lastExecution.empty) {
      const lastData = lastExecution.docs[0].data();
      const lastTime = new Date(lastData.timestamp);
      const now = new Date();
      minutesSinceLast = (now - lastTime) / (1000 * 60);
      
      console.log(`   📅 Last execution: ${lastTime.toLocaleString()}`);
      console.log(`   ⏰ Minutes ago: ${minutesSinceLast.toFixed(0)}`);
      
      if (minutesSinceLast <= 10) {
        console.log(`   ✅ GitHub Actions is ACTIVE and running regularly!`);
      } else if (minutesSinceLast <= 60) {
        console.log(`   ⚠️ GitHub Actions may be delayed`);
      } else {
        console.log(`   ❌ GitHub Actions appears to be STOPPED`);
      }
      
      // Check if it's running on schedule (every 5 minutes)
      const expectedNextExecution = new Date(lastTime.getTime() + 5 * 60 * 1000);
      const nextExecutionIn = (expectedNextExecution - now) / (1000 * 60);
      
      if (nextExecutionIn > 0 && nextExecutionIn <= 5) {
        console.log(`   ⏭ Next expected execution: in ${nextExecutionIn.toFixed(0)} minutes`);
      } else if (nextExecutionIn <= 0) {
        console.log(`   ⚠️ Overdue by ${Math.abs(nextExecutionIn).toFixed(0)} minutes!`);
      }
    } else {
      console.log('   ❌ No executions found ever');
    }

    // 3. Check recent alerts from GitHub Actions
    console.log('\n🚨 RECENT ALERTS FROM GITHUB ACTIONS:');
    const alertsSnapshot = await db.collection('drawdown_alerts')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (alertsSnapshot.empty) {
      console.log('   ✅ No recent alerts (good!)');
    } else {
      console.log(`   📨 Found ${alertsSnapshot.size} recent alert(s):`);
      alertsSnapshot.forEach(doc => {
        const data = doc.data();
        const alertTime = new Date(data.timestamp).toLocaleString();
        console.log(`      🚨 ${data.symbol}: ${data.drawdown.toFixed(1)}% at ${alertTime}`);
      });
    }

    // 4. Check if peaks are being updated
    console.log('\n📈 PEAK UPDATE ACTIVITY:');
    const peaksSnapshot = await db.collection('portfolio_assets').get();
    
    let recentlyUpdated = 0;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    peaksSnapshot.forEach(doc => {
      const data = doc.data();
      const lastUpdate = new Date(data.data_massimo || data.updated_at);
      
      if (lastUpdate > oneDayAgo) {
        recentlyUpdated++;
      }
    });
    
    console.log(`   📊 Assets with recent peak updates: ${recentlyUpdated}/${peaksSnapshot.size}`);
    
    if (recentlyUpdated > 0) {
      console.log(`   ✅ GitHub Actions is actively updating peaks!`);
    } else {
      console.log(`   ⚠️ No peaks updated in last 24 hours`);
    }

    // 5. Summary
    console.log('\n📋 GITHUB ACTIONS STATUS SUMMARY:');
    console.log('==========================================');
    
    if (!lastExecution.empty) {
      const lastData = lastExecution.docs[0].data();
      const status = lastData.status || 'unknown';
      const lastRun = new Date(lastData.timestamp).toLocaleString();
      
      console.log(`🚀 Status: ${status.toUpperCase()}`);
      console.log(`📅 Last run: ${lastRun}`);
      console.log(`📊 Schedule: Every 5 minutes`);
      console.log(`🔗 Repository: etf-guardian-clean`);
      console.log(`⚡ Workflow: price-monitor.yml`);
      
      if (minutesSinceLast <= 10) {
        console.log(`✅ GitHub Actions is RUNNING CORRECTLY!`);
      } else if (minutesSinceLast <= 60) {
        console.log(`⚠️ GitHub Actions may have delays`);
      } else {
        console.log(`❌ GitHub Actions appears to be STOPPED`);
      }
    } else {
      console.log('❌ No executions found ever');
    }

    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('==========================================');
    
    if (minutesSinceLast > 10) {
      console.log('⚠️ Check GitHub Actions tab in repository');
      console.log('⚠️ Verify workflow is enabled');
      console.log('⚠️ Check for workflow errors');
    }
    
    if (recentlyUpdated === 0) {
      console.log('⚠️ Peaks not updating - check price fetching');
      console.log('⚠️ Verify Firebase permissions');
    }
    
    console.log('💡 Run "node simulate-github-actions.js" to test manually');
    
  } catch (error) {
    console.error('❌ Error checking GitHub Actions logs:', error);
  }
}

// Run the check
checkGitHubActionsLogs().then(() => {
  console.log('\n🎉 GitHub Actions log check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Log check failed:', error);
  process.exit(1);
});
