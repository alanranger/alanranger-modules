// Alan Ranger Photography Academy - Assessment Engine (Memberstack Integration)
// This version uses Memberstack authentication for seamless exam access
// Legacy Supabase auth is kept only for migration flow

(function(){
  // Supabase configuration (for legacy migration only)
  const SUPABASE_URL = 'https://dqrtcsvqsfgbqmnonkpt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5OTA4MjUsImV4cCI6MjA3MjU2NjgyNX0.e19j8NOUK5HWoTGZv4B62U_n0je_19Tp-F20qKGbWDk';
  
  // Initialize Supabase client (legacy migration only)
  const { createClient } = supabase;
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // App state
  let memberstackIdentity = null; // { memberstack_id, email, permissions, planConnections }
  let legacySupabaseUser = null; // For migration flow only
  let quizAnswers = {};
  let isSubmitting = false;
  let lastEmailSent = 0;
  const EMAIL_DEBOUNCE_MS = 60000; // 60 seconds
  let isMigrating = false; // Flag for migration flow
  
  // Module loading system
  let currentModule = null;
  const moduleCache = new Map();
  
  // Load module from JSON file
  async function loadModule(moduleId) {
    if (moduleCache.has(moduleId)) {
      return moduleCache.get(moduleId);
    }
    
    try {
      const response = await fetch(`https://alanranger.github.io/alanranger-modules/modules/${moduleId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load module: ${response.status}`);
      }
      const moduleData = await response.json();
      moduleCache.set(moduleId, moduleData);
      return moduleData;
    } catch (error) {
      console.error('Error loading module:', error);
      showToast(`Failed to load module ${moduleId}`, 'err');
      return null;
    }
  }
  
  // Initialize with current module
  async function initializeModule() {
    if (window.MODULE) {
      currentModule = window.MODULE;
    } else {
      currentModule = await loadModule('module-01');
    }
    
    if (currentModule) {
      renderQuiz();
    }
  }
  
  // Switch to a different module
  async function switchModule(moduleId) {
    const newModule = await loadModule(moduleId);
    if (newModule) {
      currentModule = newModule;
      quizAnswers = {};
      render();
    }
  }
  
  window.switchModule = switchModule;
  
  // Toast notification system
  function showToast(message, type = 'info') {
    const toast = document.getElementById('ar-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `ar-toast ${type}`;
    toast.style.display = 'block';
    
    setTimeout(() => {
      toast.style.display = 'none';
    }, 5000);
  }
  
  // ========== MEMBERSTACK AUTHENTICATION ==========
  
  /**
   * Get Memberstack identity via API
   * Returns { memberstack_id, email, permissions, planConnections } or null
   */
  async function getExamIdentity() {
    try {
      const r = await fetch("/api/exams/whoami", { credentials: "include" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      console.error("[getExamIdentity] Error:", e);
      return null;
    }
  }
  
  /**
   * Save results via Memberstack API
   */
  async function saveResultsViaMemberstack(report) {
    if (!memberstackIdentity) {
      throw new Error("Not authenticated");
    }
    
    // Calculate attempt number
    const latestStatus = await getLatestStatusViaMemberstack(report.moduleId);
    const attempt = latestStatus ? (latestStatus.attempt || 0) + 1 : 1;
    
    const payload = {
      module_id: report.moduleId,
      score_percent: report.score,
      passed: report.passed,
      attempt: attempt,
      details: { misses: report.misses || [] }
    };
    
    const r = await fetch("/api/exams/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Failed to save" }));
      throw new Error(error.error || "Failed to save");
    }
    
    return await r.json();
  }
  
  /**
   * Get latest exam status via Memberstack API
   */
  async function getLatestStatusViaMemberstack(moduleId) {
    if (!memberstackIdentity) return null;
    
    try {
      const r = await fetch(`/api/exams/status?moduleId=${encodeURIComponent(moduleId)}`, {
        credentials: "include"
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j.latest || null;
    } catch (e) {
      console.error("[getLatestStatusViaMemberstack] Error:", e);
      return null;
    }
  }
  
  // ========== LEGACY SUPABASE AUTH (Migration only) ==========
  
  /**
   * Legacy Supabase magic link sign-in (for migration flow only)
   */
  async function signInWithEmailLegacy(email) {
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'err');
      return;
    }
    
    const now = Date.now();
    if (now - lastEmailSent < EMAIL_DEBOUNCE_MS) {
      showToast('Use the link we just sent, or try again in ~60s.', 'warn');
      return;
    }
    
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.href
        }
      });
      
      if (error) {
        if (error.message.includes('rate limit')) {
          showToast('Use the link we just sent, or try again in ~60s.', 'warn');
        } else {
          showToast('Invalid email address', 'err');
        }
        return;
      }
      
      lastEmailSent = now;
      showToast('Magic link sent! Check your email and click the link to complete migration.', 'ok');
      
    } catch (err) {
      showToast('Something went wrong. Please try again.', 'err');
    }
  }
  
  /**
   * Migrate legacy exam results to Memberstack
   */
  async function migrateLegacyResults() {
    if (!memberstackIdentity || !legacySupabaseUser) {
      showToast('Please complete the legacy sign-in first', 'warn');
      return;
    }
    
    try {
      showToast('Migrating legacy results...', 'info');
      
      const r = await fetch("/api/exams/migrate-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supabase_user_id: legacySupabaseUser.id,
          legacy_email: legacySupabaseUser.email
        })
      });
      
      if (!r.ok) {
        const error = await r.json().catch(() => ({ error: "Migration failed" }));
        throw new Error(error.error || "Migration failed");
      }
      
      const result = await r.json();
      showToast(result.message || `Migrated ${result.copied} results`, 'ok');
      
      // Clear legacy session
      await supabaseClient.auth.signOut();
      legacySupabaseUser = null;
      isMigrating = false;
      
      // Refresh UI
      render();
      
    } catch (e) {
      console.error("[migrateLegacyResults] Error:", e);
      showToast('Migration failed. Please try again.', 'err');
    }
  }
  
  // ========== SAVE FLOW ==========
  
  function queueResultsForSave() {
    const results = {
      moduleId: currentModule.moduleId,
      answers: quizAnswers,
      timestamp: new Date().toISOString(),
      score: calculateScore()
    };
    localStorage.setItem('ar_queued_results', JSON.stringify(results));
  }
  
  async function saveResults() {
    // Try Memberstack first
    if (memberstackIdentity) {
      try {
        const report = {
          moduleId: currentModule.moduleId,
          score: calculateScore(),
          passed: calculateScore() >= currentModule.passMark,
          misses: getMissedQuestions()
        };
        
        await saveResultsViaMemberstack(report);
        showToast('Results saved to your account!', 'ok');
        return;
      } catch (err) {
        console.error("[saveResults] Memberstack save failed:", err);
        showToast('Failed to save results. Please try again.', 'err');
        return;
      }
    }
    
    // Fallback to legacy (shouldn't happen in normal flow)
    if (legacySupabaseUser) {
      showToast('Please use the migration flow to link your account', 'warn');
      return;
    }
    
    showToast('Please sign in to save your results', 'warn');
  }
  
  function getMissedQuestions() {
    if (!currentModule.questions) return [];
    const misses = [];
    currentModule.questions.forEach((q, i) => {
      if (quizAnswers[i] !== q.correct) {
        misses.push(i + 1); // 1-indexed question numbers
      }
    });
    return misses;
  }
  
  // ========== QUIZ FUNCTIONS ==========
  
  function calculateScore() {
    if (!currentModule.questions || currentModule.questions.length === 0) return 0;
    
    let correct = 0;
    currentModule.questions.forEach((q, i) => {
      if (quizAnswers[i] === q.correct) correct++;
    });
    
    return Math.round((correct / currentModule.questions.length) * 100);
  }
  
  function handleAnswerChange(questionIndex, answer) {
    quizAnswers[questionIndex] = answer;
    render();
  }
  
  function resetQuiz() {
    quizAnswers = {};
    window.quizResults = null;
    render();
  }
  
  async function submitAnswers() {
    if (isSubmitting) return;
    
    const answered = Object.keys(quizAnswers).length;
    const total = currentModule.questions ? currentModule.questions.length : 0;
    
    if (answered < total) {
      showToast(`Please answer all ${total} questions before submitting.`, 'warn');
      return;
    }
    
    isSubmitting = true;
    const score = calculateScore();
    const passed = score >= currentModule.passMark;
    
    const results = currentModule.questions.map((q, i) => {
      const isCorrect = quizAnswers[i] === q.correct;
      return `Q${i + 1}: ${isCorrect ? 'Correct' : 'Incorrect'}`;
    }).join(', ');
    
    showToast(
      `Quiz completed! Score: ${score}% ${passed ? '✅ Passed' : '❌ Failed'}`, 
      passed ? 'ok' : 'warn'
    );
    
    window.quizResults = { score, passed, results, submitted: true };
    
    // Auto-save if authenticated
    if (memberstackIdentity) {
      try {
        const report = {
          moduleId: currentModule.moduleId,
          score: score,
          passed: passed,
          misses: getMissedQuestions()
        };
        await saveResultsViaMemberstack(report);
      } catch (err) {
        console.error("[submitAnswers] Auto-save failed:", err);
      }
    } else if (!isMigrating) {
      // Queue for save if not signed in (and not in migration flow)
      queueResultsForSave();
    }
    
    isSubmitting = false;
    render();
  }
  
  // ========== RENDER FUNCTION ==========
  
  async function render() {
    // Get latest status if authenticated
    let latestStatus = null;
    if (memberstackIdentity && currentModule) {
      latestStatus = await getLatestStatusViaMemberstack(currentModule.moduleId);
    }
    
    const authStatus = memberstackIdentity ? 
      `<div class="pill ok">Signed in as ${memberstackIdentity.email}</div>` : 
      `<div class="pill warn">Not signed in — <a href="/academy/login" style="color:inherit;text-decoration:underline;">Sign in to Academy</a></div>`;
    
    // Migration UI (only show if Memberstack user but no legacy link)
    let migrationUI = '';
    if (memberstackIdentity && !isMigrating && !legacySupabaseUser) {
      migrationUI = `
        <div class="card" style="border-left:4px solid #f59e0b;">
          <h3 class="qtitle">Import Previous Exam Progress</h3>
          <p style="margin:8px 0 12px 0;color:#666;">If you have previous exam results from the legacy system, you can import them here.</p>
          <button class="btn btn-neutral" onclick="startMigration()" style="background:#f59e0b;color:#fff;">
            Import previous exam progress
          </button>
        </div>
      `;
    }
    
    // Legacy sign-in form (only shown during migration)
    const legacySignInForm = (isMigrating && !legacySupabaseUser) ? `
      <div class="card" style="border-left:4px solid #f59e0b;">
        <h3 class="qtitle">Sign in with Legacy Email</h3>
        <p style="margin:8px 0 12px 0;color:#666;">Enter the email you used for previous exams to import your results.</p>
        <div style="display:flex;gap:8px;align-items:center;margin:12px 0;">
          <input type="email" id="legacy-email-input" placeholder="your@email.com" 
                 style="flex:1;padding:8px 12px;border:1px solid var(--ar-border);border-radius:6px;">
          <button class="btn btn-orange" onclick="handleLegacySignIn()">Send magic link</button>
        </div>
        <div class="help">We'll send you a secure link to sign in. No password required.</div>
        <button class="btn btn-neutral" onclick="cancelMigration()" style="margin-top:8px;">Cancel</button>
      </div>
    ` : '';
    
    // Migration complete button (if legacy user is signed in)
    const migrateButton = (isMigrating && legacySupabaseUser) ? `
      <div class="card" style="border-left:4px solid #10b981;">
        <h3 class="qtitle">Ready to Import</h3>
        <p style="margin:8px 0 12px 0;color:#666;">Signed in as ${legacySupabaseUser.email}. Click to import your legacy results.</p>
        <button class="btn btn-green" onclick="migrateLegacyResults()">Import Results</button>
        <button class="btn btn-neutral" onclick="cancelMigration()" style="margin-left:8px;">Cancel</button>
      </div>
    ` : '';
    
    const quizContent = currentModule.questions && currentModule.questions.length > 0 ? 
      currentModule.questions.map((q, i) => `
        <div class="card">
          <h3 class="qtitle">Question ${i + 1}</h3>
          <p style="margin:8px 0 16px 0;">${q.question}</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${q.options.map((option, j) => `
              <label class="radio-option" 
                     onmouseover="this.style.background='#f9f9f9'" 
                     onmouseout="this.style.background='transparent'">
                <input type="radio" name="q${i}" value="${j}" 
                       ${quizAnswers[i] === j ? 'checked' : ''}
                       onchange="handleAnswerChange(${i}, ${j})" 
                       class="radio-input">
                <span class="radio-text">${option}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('') : `
        <div class="card">
          <h3 class="qtitle">No questions available</h3>
          <p>The quiz questions haven't been loaded yet. Please check the module configuration.</p>
        </div>
      `;
    
    const resultsDisplay = window.quizResults && window.quizResults.submitted ? `
      <div class="card" style="background:#f8f9fa;border-left:4px solid var(--ar-orange);">
        <h3 class="qtitle">Quiz Results</h3>
        <p style="margin:8px 0;font-weight:600;color:${window.quizResults.passed ? '#10b981' : '#ef4444'};">
          Score: ${window.quizResults.score}% ${window.quizResults.passed ? '✅ Passed' : '❌ Failed'}
        </p>
        ${latestStatus ? `
          <p style="margin:8px 0 0 0;font-size:14px;color:var(--ar-muted);">
            Previous best: ${latestStatus.score_percent}% ${latestStatus.passed ? '(Passed)' : ''} on ${new Date(latestStatus.created_at).toLocaleDateString()}
          </p>
        ` : ''}
        <p style="margin:8px 0 0 0;font-size:14px;color:var(--ar-muted);">
          ${window.quizResults.results}
        </p>
      </div>
    ` : '';
    
    const score = calculateScore();
    const answered = Object.keys(quizAnswers).length;
    const total = currentModule.questions ? currentModule.questions.length : 0;
    
    const root = document.getElementById('ar-quiz-root') || document.body;
    root.innerHTML = `
      <div class="bar card">
        ${authStatus}
        <h2 style="margin:10px 0 0 0">Module: ${currentModule.title}</h2>
        <div class="help">
          ${total > 0 ? `Progress: ${answered}/${total} questions answered` : 'Quiz content loading...'}
          ${score > 0 ? ` • Current score: ${score}%` : ''}
        </div>
      </div>
      
      ${migrationUI}
      ${legacySignInForm}
      ${migrateButton}
      
      ${quizContent}
      
      ${resultsDisplay}

      <div class="card">
        <div class="actions">
          <button class="btn btn-orange" onclick="submitAnswers()" 
                  ${isSubmitting || answered < total ? 'disabled' : ''}>
            Submit answers
          </button>
          <button class="btn btn-neutral" onclick="resetQuiz()">Reset</button>
          <button class="btn btn-blue" onclick="downloadResultsPDF()" 
                  ${!window.quizResults || !window.quizResults.submitted ? 'disabled' : ''}>
            Download results (PDF)
          </button>
          <button class="btn btn-green" onclick="downloadCertificatePDF()" 
                  ${!window.quizResults || !window.quizResults.submitted || !window.quizResults.passed ? 'disabled' : ''}>
            Download certificate (PDF)
          </button>
          <button class="btn btn-neutral" onclick="saveResults()" 
                  ${!memberstackIdentity ? 'disabled' : ''}>
            Save to my account
          </button>
        </div>
        <div class="help">
          ${total > 0 ? `Answer all ${total} questions to submit. Pass mark: ${currentModule.passMark}%` : 'Quiz configuration needed.'}
        </div>
      </div>

      <div id="ar-toast" role="status" aria-live="polite"></div>
    `;
  }
  
  // Alias for compatibility
  function renderQuiz() {
    render();
  }
  
  // ========== PDF GENERATION (unchanged) ==========
  
  async function downloadResultsPDF() {
    if (!window.quizResults || !window.quizResults.submitted) return;
    
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      doc.setFillColor(229, 114, 0);
      doc.rect(0, 0, 210, 20, 'F');
      
      const orgIcon = await getBase64Image('src/assets/logo-full.png');
      if (orgIcon) {
        doc.addImage('data:image/png;base64,' + orgIcon, 'PNG', 10, 5, 15, 10);
      }
      
      const academyCap = await getBase64Image('src/assets/academy.png');
      if (academyCap) {
        doc.addImage('data:image/png;base64,' + academyCap, 'PNG', 180, 5, 20, 10);
      }
      
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(`Module: ${currentModule.title}`, 20, 40);
      
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 249, 250);
      doc.rect(20, 50, 170, 40, 'FD');
      
      const studentName = memberstackIdentity ? memberstackIdentity.email : 'Student';
      doc.setFontSize(10);
      doc.text(`Name: ${studentName}`, 25, 60);
      doc.text(`Score: ${window.quizResults.score}%`, 25, 68);
      doc.text(`Result: ${window.quizResults.passed ? 'PASSED' : 'FAILED'}`, 25, 76);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 25, 84);
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(window.quizResults.results, 20, 110);
      
      doc.save(`assessment-results-${currentModule.moduleId}.pdf`);
      
    } catch (err) {
      showToast('Failed to generate PDF. Please try again.', 'err');
    }
  }
  
  async function downloadCertificatePDF() {
    if (!window.quizResults || !window.quizResults.submitted || !window.quizResults.passed) return;
    
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('landscape', 'mm', 'a4');
      
      doc.setDrawColor(229, 114, 0);
      doc.setLineWidth(3);
      doc.rect(10, 10, 277, 190);
      
      doc.setDrawColor(128, 128, 128);
      doc.setLineWidth(1);
      doc.rect(15, 15, 267, 180);
      
      const logoWidth = 40;
      const logoHeight = 20;
      const brandLogo = await getBase64Image('src/assets/logo-full.png');
      if (brandLogo) {
        doc.addImage('data:image/png;base64,' + brandLogo, 'PNG', 240, 25, logoWidth, logoHeight);
      }
      
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text('Certificate ID: AR-2024-001', 20, 25);
      
      const pageWidth = 297;
      const centerX = pageWidth / 2;
      
      doc.setFont('times', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(0, 0, 0);
      const titleText = 'Certificate of Achievement';
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, centerX - titleWidth/2, 80);
      
      doc.setFont('times', 'normal');
      doc.setFontSize(16);
      const studentName = memberstackIdentity ? memberstackIdentity.email : 'Student';
      const nameText = `This certifies that ${studentName}`;
      const nameWidth = doc.getTextWidth(nameText);
      doc.text(nameText, centerX - nameWidth/2, 100);
      
      doc.setFontSize(14);
      const moduleText = `has successfully completed ${currentModule.title}`;
      const moduleWidth = doc.getTextWidth(moduleText);
      doc.text(moduleText, centerX - moduleWidth/2, 120);
      
      const scoreText = `with a score of ${window.quizResults.score}%`;
      const scoreWidth = doc.getTextWidth(scoreText);
      doc.text(scoreText, centerX - scoreWidth/2, 135);
      
      const dateText = `Completed on ${new Date().toLocaleDateString()}`;
      const dateWidth = doc.getTextWidth(dateText);
      doc.text(dateText, centerX - dateWidth/2, 150);
      
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      const straplineText = 'Alan Ranger Photography Academy — Beginners Modules included';
      const straplineWidth = doc.getTextWidth(straplineText);
      doc.text(straplineText, centerX - straplineWidth/2, 170);
      
      doc.setDrawColor(229, 114, 0);
      doc.setLineWidth(1);
      const ruleStartX = centerX - 50;
      const ruleEndX = centerX + 50;
      doc.line(ruleStartX, 180, ruleEndX, 180);
      
      const sigWidth = 50;
      const sigHeight = 15;
      const signature = await getBase64Image('src/assets/signature.png');
      if (signature) {
        doc.addImage('data:image/png;base64,' + signature, 'PNG', ruleStartX, 185, sigWidth, sigHeight);
      }
      
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text('Instructor: Alan Ranger', 20, 200);
      doc.text('Website: www.alanranger.com', 20, 205);
      
      doc.save(`certificate-${currentModule.moduleId}.pdf`);
      
    } catch (err) {
      showToast('Failed to generate certificate. Please try again.', 'err');
    }
  }
  
  async function getBase64Image(imagePath) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => resolve('');
      img.src = imagePath;
    });
  }
  
  // ========== GLOBAL EVENT HANDLERS ==========
  
  window.startMigration = function() {
    isMigrating = true;
    render();
  };
  
  window.cancelMigration = function() {
    isMigrating = false;
    if (legacySupabaseUser) {
      supabaseClient.auth.signOut();
      legacySupabaseUser = null;
    }
    render();
  };
  
  window.handleLegacySignIn = function() {
    const email = document.getElementById('legacy-email-input')?.value;
    if (email) {
      signInWithEmailLegacy(email);
    }
  };
  
  window.handleAnswerChange = handleAnswerChange;
  window.submitAnswers = submitAnswers;
  window.resetQuiz = resetQuiz;
  window.saveResults = saveResults;
  window.migrateLegacyResults = migrateLegacyResults;
  window.downloadResultsPDF = downloadResultsPDF;
  window.downloadCertificatePDF = downloadCertificatePDF;
  
  // ========== INITIALIZATION ==========
  
  async function init() {
    // Load the module first
    await initializeModule();
    
    // Check Memberstack identity first (primary flow)
    memberstackIdentity = await getExamIdentity();
    
    if (memberstackIdentity) {
      console.log("[init] Memberstack user authenticated:", memberstackIdentity.email);
    } else {
      console.log("[init] No Memberstack session - user needs to sign in to Academy");
    }
    
    // Listen for legacy Supabase auth (migration flow only)
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session && isMigrating) {
        legacySupabaseUser = session.user;
        console.log("[init] Legacy Supabase user signed in:", legacySupabaseUser.email);
        render();
      } else if (event === 'SIGNED_OUT') {
        legacySupabaseUser = null;
        if (isMigrating) {
          render();
        }
      }
    });
    
    // Check for existing legacy session (migration flow)
    if (isMigrating) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        legacySupabaseUser = session.user;
      }
    }
    
    render();
  }
  
  // Start the app
  init();
})();
