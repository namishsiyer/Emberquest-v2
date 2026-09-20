/* ===== app.js — Main Application Controller ===== */
(() => {
  // Global DOM References
  let sprite = null;
  let animId = null;
  let lastTime = 0;
  let selectedMood = 'fire';
  let selectedSkin = 0;
  let selectedHair = 0;
  let selectedGender = 'male';

  // Stopwatch state
  let timerRunning = false;
  let timerSeconds = 0;
  let timerInterval = null;
  let activeTimerMode = 'study';

  // Rotating graph state
  let activeRotatingCategory = 'hours';
  let rotatingCycleTimer = null;
  let rotatingProgressTimer = null;
  let rotatingProgressMs = 0;
  let isRotatingPaused = false;

  // Confetti particles
  let confettiParticles = [];
  let confettiAnimId = null;

  // Dynamic speech quotes
  const SPEECH_QUOTES = {
    flex: ["Check out the gains! Consistency pays off.", "Every rep counts toward greatness!", "We're building a fortress!"],
    run: ["Feet on the pavement, mind in the zone!", "Endurance is freedom.", "Outrunning yesterday's limits!"],
    press: ["Heavy weights, heavier determination!", "Pushing past the comfort zone.", "Strength is earned, never given."],
    read: ["Knowledge is the ultimate stat multiplier.", "Sharp mind, unstoppable warrior.", "Focusing like a grandmaster."],
    jump: ["High energy! Let's conquer the day!", "Leveling up in real life!", "Unstoppable momentum!"],
    wave: ["Greetings, Champion! What are we conquering next?", "Hey there! Ready for today's quest?", "Always grinding, always growing."],
    idle_good: ["Physique is on point. Keep pushing!", "Feeling strong today. Let's maintain this momentum!", "Stats are rising!"],
    idle_warn: ["Skipping workouts makes the muscles fade...", "Too much junk food slows down our quest...", "Hydrate and get some reps in!"]
  };

  function getRandomQuote(category) {
    const list = SPEECH_QUOTES[category] || SPEECH_QUOTES.idle_good;
    return list[Math.floor(Math.random() * list.length)];
  }

  function setSpeech(text) {
    const el = document.getElementById('hero-speech');
    if (el) el.textContent = `"${text}"`;
  }

  /* ==================== INITIALIZATION ==================== */
  function initApp() {
    // 1. Initialize State
    let saved = loadLocal();
    if (!saved) {
      // First time player -> open onboarding modal
      openProfileModal(true);
      // Temporary initial default state for canvas preview
      S = newState({ name: 'Hero', age: 20, gender: 'male', skin: 0, hair: 0 });
    } else {
      S = saved;
    }

    // Connect logic save listener
    onSave = () => {
      renderHUD();
      renderBodyStats();
      renderVitals();
      renderQuests();
      renderChallenges();
      renderBoss();
      renderRotatingPerformanceGraph();
      renderHabitQuickSummary();
      renderAchievementsPreview();
      RadarChart.render();
    };

    // 2. Initialize Canvas Sprite
    const canvas = document.getElementById('hero-canvas');
    if (canvas) {
      sprite = createSprite(canvas);
      sprite.setLook(S.profile.skin || 0, S.profile.hair || 0, S.level || 1, S.profile.gender || 'male');
      const b = bodyModel();
      sprite.setBody(b.fit / 100, b.fat / 100, true);
    }

    // 3. Initialize Audio
    AudioFX.setEnabled(S.settings ? S.settings.sound !== false : true);
    updateSoundBtn();

    // 4. Initialize Radar Chart
    RadarChart.init('radar-chart-container');

    // 5. Check Missed Day Penalties
    if (saved) {
      const missed = processMissed();
      if (missed && (missed.lost > 0 || missed.shielded > 0)) {
        setTimeout(() => {
          if (missed.shielded > 0) {
            AudioFX.penalty();
            showToast(`🛡️ Shield activated! Protected you from ${missed.shielded} missed day(s).`);
          } else if (missed.lost > 0) {
            AudioFX.penalty();
            showToast(`⚠️ Inactivity decay: -${missed.lost} XP for ${missed.days} unlogged day(s). Log today to stop decay!`);
          }
          if (missed.evts) handleGameEvents(missed.evts);
        }, 800);
      }
    }

    // 6. Bind Event Listeners
    bindEvents();

    // 7. Initialize 7-Second Rotating Category Graph
    initRotatingPerformanceGraph();

    // 8. Initial UI Render
    renderAll();

    // 9. Start Sprite Animation Loop
    lastTime = performance.now() / 1000;
    requestAnimationFrame(renderLoop);
  }

  /* ==================== ANIMATION LOOP ==================== */
  function renderLoop(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(now - lastTime, 0.1);
    lastTime = now;

    if (sprite) {
      sprite.update(now, dt);
    }

    animId = requestAnimationFrame(renderLoop);
  }

  /* ==================== EVENT BINDING ==================== */
  function bindEvents() {
    // Sound Toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const next = !AudioFX.isEnabled();
        AudioFX.setEnabled(next);
        S.settings.sound = next;
        save();
        updateSoundBtn();
        if (next) AudioFX.click();
      });
    }

    // Profile Modals
    const profileBtn = document.getElementById('btn-profile-edit');
    const avatarMini = document.getElementById('hud-avatar-mini');
    if (profileBtn) profileBtn.addEventListener('click', () => openProfileModal(false));
    if (avatarMini) avatarMini.addEventListener('click', () => openProfileModal(false));

    const closeProfileBtn = document.getElementById('btn-close-profile');
    if (closeProfileBtn) {
      closeProfileBtn.addEventListener('click', () => {
        document.getElementById('modal-profile').classList.remove('active');
      });
    }

    // Profile Form Submit
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('profile-name').value.trim() || 'Hero';
        const age = parseInt(document.getElementById('profile-age').value, 10) || 20;
        
        S.profile.name = name;
        S.profile.age = age;
        S.profile.gender = selectedGender || 'male';
        S.profile.skin = selectedSkin;
        S.profile.hair = selectedHair;
        S.goals = Object.assign(defaultGoals(age), S.goals || {});

        save();
        if (sprite) {
          sprite.setLook(selectedSkin, selectedHair, S.level, S.profile.gender);
        }
        document.getElementById('modal-profile').classList.remove('active');
        AudioFX.questComplete();
        renderAll();
        setSpeech(`Welcome, ${name}! Let's crush today's objectives!`);
      });
    }

    // Gender selection buttons
    document.querySelectorAll('#gender-options .gender-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gender-options .gender-tab-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGender = btn.getAttribute('data-gender') || 'male';
        if (sprite) sprite.setLook(selectedSkin, selectedHair, S.level, selectedGender);
      });
    });

    // Skin & Hair pickers
    document.querySelectorAll('#skin-options .color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#skin-options .color-swatch-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSkin = parseInt(btn.getAttribute('data-skin'), 10);
        if (sprite) sprite.setLook(selectedSkin, selectedHair, S.level, selectedGender);
      });
    });
    document.querySelectorAll('#hair-options .color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#hair-options .color-swatch-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedHair = parseInt(btn.getAttribute('data-hair'), 10);
        if (sprite) sprite.setLook(selectedSkin, selectedHair, S.level, selectedGender);
      });
    });

    // Hero Canvas Click Interaction
    const heroWrap = document.getElementById('hero-canvas-wrap');
    if (heroWrap) {
      heroWrap.addEventListener('click', (e) => {
        if (!sprite) return;
        const action = sprite.poke();
        AudioFX.poke();
        setSpeech(getRandomQuote(action));
        spawnFloatingXp(e.clientX, e.clientY, '✨ POKE', false);
      });
    }

    // Hero Action Pills
    document.querySelectorAll('.hero-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pose = btn.getAttribute('data-pose');
        if (sprite) {
          sprite.play(pose, pose === 'jump' ? 1.0 : 2.2);
          AudioFX.click();
          setSpeech(getRandomQuote(pose));
        }
      });
    });

    // Data Management Modal
    const dataBtn = document.getElementById('btn-data-manage');
    const closeDataBtn = document.getElementById('btn-close-data');
    if (dataBtn) {
      dataBtn.addEventListener('click', () => {
        document.getElementById('modal-data').classList.add('active');
      });
    }
    if (closeDataBtn) {
      closeDataBtn.addEventListener('click', () => {
        document.getElementById('modal-data').classList.remove('active');
      });
    }

    // Export JSON
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const jsonStr = JSON.stringify(S, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `emberquest-save-${today()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        AudioFX.click();
      });
    }

    // Import JSON
    const importInput = document.getElementById('file-import-json');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            if (imported && imported.profile) {
              S = normalizeState(imported);
              save();
              renderAll();
              if (sprite) {
                sprite.setLook(S.profile.skin || 0, S.profile.hair || 0, S.level || 1);
                const b = bodyModel();
                sprite.setBody(b.fit / 100, b.fat / 100, true);
              }
              document.getElementById('modal-data').classList.remove('active');
              AudioFX.levelUp();
              showToast('Save file restored successfully!');
            } else {
              alert('Invalid EmberQuest save file.');
            }
          } catch (err) {
            alert('Could not parse save file: ' + err.message);
          }
        };
        reader.readAsText(file);
      });
    }

    // Reset Game
    const resetBtn = document.getElementById('btn-reset-game');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you absolutely sure you want to reset all game progress? This cannot be undone.')) {
          localStorage.removeItem(LS_KEY);
          location.reload();
        }
      });
    }

    // Diary Mood Buttons
    document.querySelectorAll('#mood-selector .mood-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mood-selector .mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMood = btn.getAttribute('data-mood');
        AudioFX.click();
      });
    });

    // Diary Form Submit
    const diaryForm = document.getElementById('diary-form');
    if (diaryForm) {
      diaryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('diary-input');
        const text = input.value.trim();
        if (!text) return;

        const res = addDiary(text, selectedMood, today());
        if (res) {
          input.value = '';
          AudioFX.questComplete();
          spawnFloatingXp(window.innerWidth / 2, window.innerHeight / 2, '+20 XP', false);
          renderHUD();
          renderDiaryList();
          renderQuests();
          RadarChart.render();
          handleGameEvents(res.evts);
        }
      });
    }

    // Focus Study Timer
    const timerToggleBtn = document.getElementById('btn-timer-toggle');
    const timerResetBtn = document.getElementById('btn-timer-reset');
    const timerLogBtn = document.getElementById('btn-timer-log');

    if (timerToggleBtn) {
      timerToggleBtn.addEventListener('click', () => {
        if (!timerRunning) {
          // Start timer
          timerRunning = true;
          timerToggleBtn.textContent = 'Pause';
          timerToggleBtn.style.background = '#e11d48';
          AudioFX.click();
          if (sprite) sprite.play('read', 9999);
          setSpeech("Deep focus session started. Keep eliminating distractions!");
          timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerDisplay();
          }, 1000);
        } else {
          // Pause timer
          timerRunning = false;
          timerToggleBtn.textContent = 'Resume';
          timerToggleBtn.style.background = '';
          clearInterval(timerInterval);
          AudioFX.click();
          if (sprite) sprite.play('idle', 1);
        }
      });
    }

    if (timerResetBtn) {
      timerResetBtn.addEventListener('click', () => {
        timerRunning = false;
        clearInterval(timerInterval);
        timerSeconds = 0;
        if (timerToggleBtn) {
          timerToggleBtn.textContent = 'Start';
          timerToggleBtn.style.background = '';
        }
        updateTimerDisplay();
        AudioFX.click();
      });
    }

    if (timerLogBtn) {
      timerLogBtn.addEventListener('click', (e) => {
        if (timerSeconds < 60) {
          showToast(`Log at least 1 minute of ${activeTimerMode === 'workout' ? 'workout' : 'focus'} time.`);
          return;
        }
        let res = null;
        if (activeTimerMode === 'workout') {
          const mins = Math.max(1, Math.round(timerSeconds / 60));
          res = addEntry('workout', mins, today(), 'Workout Timer Session');
          if (res) {
            setSpeech(`Beast mode! Logged ${mins} mins of training. Body fat burning!`);
          }
        } else {
          const hours = Number((timerSeconds / 3600).toFixed(1));
          if (hours > 0) {
            res = addEntry('study', hours, today(), 'Focus Timer Session');
            if (res) {
              setSpeech(`Great study session! Logged ${hours} hours of knowledge.`);
            }
          }
        }
        if (res) {
          AudioFX.xpGain();
          spawnFloatingXp(e.clientX, e.clientY, `+${res.entry.xp} XP`, false);
          timerSeconds = 0;
          if (timerRunning) {
            clearInterval(timerInterval);
            timerRunning = false;
            if (timerToggleBtn) {
              timerToggleBtn.textContent = 'Start';
              timerToggleBtn.style.background = '';
            }
          }
          updateTimerDisplay();
          renderAll();
          handleGameEvents(res.evts);
        }
      });
    }

    // Timer Mode Chips (Study, Workout, Pomodoro)
    document.querySelectorAll('#page-goals .timer-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#page-goals .timer-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTimerMode = btn.getAttribute('data-mode') || 'study';
        const label = document.getElementById('timer-active-label');
        if (label) {
          if (activeTimerMode === 'workout') label.textContent = 'Workout & Cardio Timer';
          else if (activeTimerMode === 'pomodoro') label.textContent = '25m Focus Sprint';
          else label.textContent = 'Deep Study Timer';
        }
        AudioFX.click();
      });
    });

    // Claim Level Up Modal Button
    const claimLevelUpBtn = document.getElementById('btn-claim-levelup');
    if (claimLevelUpBtn) {
      claimLevelUpBtn.addEventListener('click', () => {
        document.getElementById('modal-levelup').classList.remove('active');
        AudioFX.click();
      });
    }

    // Close Activity Details Modal
    const closeActDetailsBtn = document.getElementById('btn-close-activity-details');
    if (closeActDetailsBtn) {
      closeActDetailsBtn.addEventListener('click', () => {
        ActivityAnalytics.close();
      });
    }

    // Add Custom Activity Modal & Form
    const openAddActBtn = document.getElementById('btn-open-add-act');
    const closeAddActBtn = document.getElementById('btn-close-add-act');
    const formAddAct = document.getElementById('form-add-activity');

    if (openAddActBtn) {
      openAddActBtn.addEventListener('click', () => {
        document.getElementById('modal-add-activity').classList.add('active');
        AudioFX.click();
      });
    }
    if (closeAddActBtn) {
      closeAddActBtn.addEventListener('click', () => {
        document.getElementById('modal-add-activity').classList.remove('active');
      });
    }
    if (formAddAct) {
      formAddAct.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('custom-act-name').value.trim();
        const ico = document.getElementById('custom-act-ico').value.trim() || '⚡';
        const unit = document.getElementById('custom-act-unit').value.trim() || '';
        const step = parseFloat(document.getElementById('custom-act-step').value) || 1;
        const priority = document.getElementById('custom-act-priority').value || 'med';
        const chipsRaw = document.getElementById('custom-act-chips').value.trim();
        const chips = chipsRaw ? chipsRaw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0) : [1, 5, 10];

        const def = addCustomActivity(name, ico, unit, step, chips, 999, priority);
        if (def) {
          document.getElementById('modal-add-activity').classList.remove('active');
          formAddAct.reset();
          AudioFX.questComplete();
          showToast(`✨ Created "${name}" activity with ${priority.toUpperCase()} priority!`);
          renderActivities();
        }
      });
    }

    // Bad Habit Quitter Modal & Form
    const openQuitterBtn = document.getElementById('btn-open-quitter');
    const closeQuitterBtn = document.getElementById('btn-close-quitter');
    const formAddQuitter = document.getElementById('form-add-quitter');

    if (openQuitterBtn) {
      openQuitterBtn.addEventListener('click', () => {
        renderHabitQuitter();
        document.getElementById('modal-habit-quitter').classList.add('active');
        AudioFX.click();
      });
    }
    if (closeQuitterBtn) {
      closeQuitterBtn.addEventListener('click', () => {
        document.getElementById('modal-habit-quitter').classList.remove('active');
      });
    }
    if (formAddQuitter) {
      formAddQuitter.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('quit-new-name').value.trim();
        const ico = document.getElementById('quit-new-ico').value.trim() || '🚭';
        if (name) {
          addBadHabit(name, ico);
          document.getElementById('quit-new-name').value = '';
          AudioFX.questComplete();
          showToast(`🛡️ Clean streak started for "${name}"!`);
          renderHabitQuitter();
        }
      });
    }

    // Life Achievements (Hall of Fame) Modal & Form
    const openAchBtn = document.getElementById('btn-open-achievements');
    const closeAchBtn = document.getElementById('btn-close-achievements');
    const formAddAch = document.getElementById('form-add-achievement');

    if (openAchBtn) {
      openAchBtn.addEventListener('click', () => {
        renderLifeAchievements();
        document.getElementById('modal-achievements').classList.add('active');
        AudioFX.click();
      });
    }
    if (closeAchBtn) {
      closeAchBtn.addEventListener('click', () => {
        document.getElementById('modal-achievements').classList.remove('active');
      });
    }
    if (formAddAch) {
      formAddAch.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('ach-title').value.trim();
        const category = document.getElementById('ach-category').value;
        const desc = document.getElementById('ach-desc').value.trim();

        if (title) {
          const res = addLifeAchievement(title, category, today(), desc);
          if (res) {
            formAddAch.reset();
            AudioFX.levelUp();
            launchConfetti();
            showToast(`🏆 Milestone unlocked: "${title}" (+100 XP)!`);
            renderLifeAchievements();
            renderHUD();
            handleGameEvents(res.evts);
          }
        }
      });
    }

    // Adventurer's Guide Modal & Tab Navigation
    const openGuideBtn = document.getElementById('btn-guide');
    const closeGuideBtn = document.getElementById('btn-close-guide');

    if (openGuideBtn) {
      openGuideBtn.addEventListener('click', () => {
        document.getElementById('modal-guide').classList.add('active');
        AudioFX.click();
      });
    }
    if (closeGuideBtn) {
      closeGuideBtn.addEventListener('click', () => {
        document.getElementById('modal-guide').classList.remove('active');
      });
    }

    // Multi-Page Tab Navigation (Fitness Tracker Style)
    const navTabs = document.querySelectorAll('.nav-tab-btn');
    const pages = document.querySelectorAll('.app-page');
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const pageId = tab.getAttribute('data-page');
        navTabs.forEach(b => b.classList.toggle('active', b === tab));
        pages.forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
        AudioFX.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Fullscreen Mode Toggle
    const fsBtn = document.getElementById('btn-fullscreen-toggle');
    if (fsBtn) {
      function syncFs() {
        const isFs = !!document.fullscreenElement;
        fsBtn.innerHTML = isFs ? '🗗' : '⛶';
        fsBtn.title = isFs ? 'Exit Fullscreen' : 'Enter Fullscreen Mode';
        fsBtn.classList.toggle('active', isFs);
      }
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
      document.addEventListener('fullscreenchange', syncFs);
    }

    // Biometric Vitals Modal Listeners
    const openVitalsBtn = document.getElementById('btn-open-vitals');
    const closeVitalsBtn = document.getElementById('btn-close-vitals');
    const formUpdateVitals = document.getElementById('form-update-vitals');

    if (openVitalsBtn) {
      openVitalsBtn.addEventListener('click', () => {
        const v = getVitals();
        document.getElementById('vital-input-hr').value = v.hr || 72;
        document.getElementById('vital-input-stress').value = v.stress || 24;
        document.getElementById('vital-input-bpsys').value = v.bpSys || 118;
        document.getElementById('vital-input-bpdia').value = v.bpDia || 76;
        document.getElementById('vital-input-sugar').value = v.sugar || 95;
        document.getElementById('vital-input-spo2').value = v.spo2 || 99;
        document.getElementById('modal-vitals').classList.add('active');
        AudioFX.click();
      });
    }
    if (closeVitalsBtn) {
      closeVitalsBtn.addEventListener('click', () => {
        document.getElementById('modal-vitals').classList.remove('active');
      });
    }
    if (formUpdateVitals) {
      formUpdateVitals.addEventListener('submit', (e) => {
        e.preventDefault();
        updateVitals({
          hr: document.getElementById('vital-input-hr').value,
          stress: document.getElementById('vital-input-stress').value,
          bpSys: document.getElementById('vital-input-bpsys').value,
          bpDia: document.getElementById('vital-input-bpdia').value,
          sugar: document.getElementById('vital-input-sugar').value,
          spo2: document.getElementById('vital-input-spo2').value,
        });
        document.getElementById('modal-vitals').classList.remove('active');
        renderVitals();
        AudioFX.questComplete();
        spawnFloatingXp(window.innerWidth / 2, window.innerHeight / 2, '💓 Vitals Logged', false);
      });
    }

    // Bad Habit launcher on Goals page
    const openQuitterGoalsBtn = document.getElementById('btn-open-quitter-goals');
    if (openQuitterGoalsBtn) {
      openQuitterGoalsBtn.addEventListener('click', () => {
        renderHabitQuitter();
        const modal = document.getElementById('modal-habit-quitter');
        if (modal) modal.classList.add('active');
        AudioFX.click();
      });
    }

    // Hall of Fame launcher on Journal page
    const openAchJournalBtn = document.getElementById('btn-open-ach-journal');
    if (openAchJournalBtn) {
      openAchJournalBtn.addEventListener('click', () => {
        renderLifeAchievements();
        const modal = document.getElementById('modal-achievements');
        if (modal) modal.classList.add('active');
        AudioFX.click();
      });
    }

    // Universal Modal Backdrop Click to Close & Escape Key Dismiss
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      }
    });
  }

  /* ==================== RENDER FUNCTIONS ==================== */
  function renderAll() {
    renderHUD();
    renderHeroView();
    renderBodyStats();
    renderVitals();
    renderActivities();
    renderQuests();
    renderBoss();
    renderChallenges();
    renderDiaryList();
    renderRotatingPerformanceGraph();
    renderHabitQuitter();
    renderHabitQuickSummary();
    renderLifeAchievements();
    renderAchievementsPreview();
    RadarChart.render();
  }

  function renderHUD() {
    const nameEl = document.getElementById('hud-hero-name');
    const rankEl = document.getElementById('hud-rank-badge');
    const streakEl = document.getElementById('hud-streak');
    const shieldsEl = document.getElementById('hud-shields');
    const levelTag = document.getElementById('hud-level-tag');
    const xpCount = document.getElementById('hud-xp-count');
    const xpFill = document.getElementById('hud-xp-fill');

    if (nameEl) nameEl.textContent = S.profile.name || 'Hero';

    const rank = rankOf(S.level);
    if (rankEl) {
      rankEl.textContent = rank.name;
      rankEl.style.borderColor = rank.color;
      rankEl.style.color = rank.color;
    }

    const curStreak = streak();
    if (streakEl) streakEl.textContent = `🔥 ${curStreak} Day${curStreak === 1 ? '' : 's'}`;

    if (shieldsEl) shieldsEl.textContent = `🛡️ ${S.shields}/3 Shields`;

    const info = levelInfo(S.xp);
    if (levelTag) levelTag.textContent = `LVL ${info.L}`;
    if (xpCount) xpCount.innerHTML = `<strong>${nf(info.into)}</strong> / ${nf(info.span)} XP`;
    if (xpFill) xpFill.style.width = `${Math.min(100, Math.max(0, info.pct * 100))}%`;
  }

  function renderHeroView() {
    if (sprite) {
      sprite.setLook(S.profile.skin || 0, S.profile.hair || 0, S.level || 1, S.profile.gender || 'male');
      const b = bodyModel();
      sprite.setBody(b.fit / 100, b.fat / 100);
    }
  }

  function renderBodyStats() {
    const b = bodyModel();
    const [label, tip] = bodyLabel(b);

    const badge = document.getElementById('body-physique-badge');
    const tipEl = document.getElementById('body-physique-tip');
    const fitVal = document.getElementById('stat-fit-val');
    const fitFill = document.getElementById('stat-fit-fill');
    const fatVal = document.getElementById('stat-fat-val');
    const fatFill = document.getElementById('stat-fat-fill');

    if (badge) badge.textContent = label;
    if (tipEl) tipEl.textContent = tip;
    if (fitVal) fitVal.textContent = `${Math.round(b.fit)}%`;
    if (fitFill) fitFill.style.width = `${Math.min(100, Math.round(b.fit))}%`;
    if (fatVal) fatVal.textContent = `${Math.round(b.fat)}%`;
    if (fatFill) fatFill.style.width = `${Math.min(100, Math.round(b.fat))}%`;

    // Render Gear Showcase
    const gearList = document.getElementById('gear-items-list');
    if (gearList) {
      gearList.innerHTML = GEAR.map(g => {
        const unlocked = S.level >= g.lvl;
        return `
          <div class="gear-item ${unlocked ? 'unlocked' : ''}" title="Unlocks at Level ${g.lvl}">
            <span>${g.ico}</span>
            <span>${g.name}</span>
            <span style="font-size: 10px; opacity: 0.8;">Lv${g.lvl}</span>
          </div>
        `;
      }).join('');
    }
  }

  function renderActivities() {
    const container = document.getElementById('activity-list');
    if (!container) return;

    const curAgg = agg(today());
    const activities = getAllActivities();

    container.innerHTML = activities.map(act => {
      const type = act.key;
      const valToday = curAgg[type] || 0;
      const priority = (S.priorities && S.priorities[type]) || 'med';
      const priLabel = priority === 'high' ? '🔥 High' : priority === 'low' ? '🌱 Low' : '⚡ Med';

      const chipsHtml = (act.chips || [1, 5, 10]).map(chip => `
        <button type="button" class="chip-btn" data-type="${type}" data-val="${chip}">
          +${chip}${act.unit ? ' ' + act.unit : ''}
        </button>
      `).join('');

      return `
        <div class="activity-row" data-type="${type}">
          <div class="act-info clickable" data-type="${type}" title="Click for 7-day trend analysis & detailed performance">
            <div class="act-ico">${act.ico}</div>
            <div class="act-name-box">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="act-label">${act.label}</span>
                <span class="priority-pill priority-${priority}">${priLabel}</span>
              </div>
              <span class="act-today-val">Today: <strong>${trimNum(valToday, act.dec || 0)} ${act.unit}</strong> &bull; <span style="font-size: 10px; color: var(--text-muted); text-decoration: underline;">Analytics ↗</span></span>
            </div>
          </div>

          <div class="act-actions">
            ${chipsHtml}
            <input type="number" step="${act.step || 1}" min="${act.step || 1}" max="${act.max || 999}" 
                   class="act-input" placeholder="${act.unit || ''}" id="act-input-${type}">
            <button type="button" class="btn-log" data-type="${type}">Log</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners to clickable headers for Detailed Analytics Modal
    container.querySelectorAll('.act-info.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.getAttribute('data-type');
        AudioFX.click();
        ActivityAnalytics.open(type);
      });
    });

    // Attach listeners to chips
    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.getAttribute('data-type');
        const val = parseFloat(btn.getAttribute('data-val'));
        logActivity(type, val, e.clientX, e.clientY);
      });
    });

    // Attach listeners to custom log buttons
    container.querySelectorAll('.btn-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.getAttribute('data-type');
        const input = document.getElementById(`act-input-${type}`);
        const val = parseFloat(input.value);
        if (val > 0) {
          logActivity(type, val, e.clientX, e.clientY);
          input.value = '';
        }
      });
    });
  }

  function logActivity(type, val, clientX, clientY) {
    const res = addEntry(type, val, today());
    if (!res) return;

    const act = ACT[type];
    const isJunk = type === 'junk';

    // Sound
    if (isJunk) {
      AudioFX.bossHit();
      if (sprite) sprite.play('munch', 2.0);
      setSpeech("Uh oh... junk food hits the body fat counter. Time to work it off!");
    } else {
      AudioFX.xpGain();
      // Character animation based on habit
      if (type === 'workout') {
        if (sprite) sprite.play('press', 2.2);
        setSpeech(getRandomQuote('press'));
      } else if (type === 'run') {
        if (sprite) sprite.play('run', 2.0);
        setSpeech(getRandomQuote('run'));
      } else if (type === 'study' || type === 'mcq') {
        if (sprite) sprite.play('read', 2.2);
        setSpeech(getRandomQuote('read'));
      } else if (type === 'water') {
        if (sprite) sprite.play('drink', 1.8);
        setSpeech("Hydration replenished! Energy levels boosting.");
      } else if (type === 'sleep') {
        if (sprite) sprite.play('sleep', 2.5);
        setSpeech("Solid recovery logged. Rest is where growth happens.");
      }
    }

    // Floating XP text
    const xpText = res.entry.xp >= 0 ? `+${res.entry.xp} XP` : `${res.entry.xp} XP`;
    spawnFloatingXp(clientX || window.innerWidth / 2, clientY || window.innerHeight / 2, xpText, isJunk);

    // Re-render UI
    renderAll();
    handleGameEvents(res.evts);
  }

  function renderQuests() {
    const list = document.getElementById('quests-list');
    const badge = document.getElementById('quests-clear-badge');
    if (!list) return;

    const quests = questsFor(today());
    const doneCount = quests.filter(q => q.done).length;

    if (badge) {
      badge.textContent = `${doneCount}/7 Complete`;
      if (doneCount >= 5) {
        badge.style.color = '#2bd47d';
        badge.style.background = 'rgba(43, 212, 125, 0.15)';
      }
    }

    list.innerHTML = quests.map(q => `
      <div class="quest-item ${q.done ? 'done' : ''}">
        <div class="quest-left">
          <span class="quest-ico">${q.ico}</span>
          <div>
            <div class="quest-name">${q.label}</div>
            <div class="quest-sub">${trimNum(q.v, 1)} / ${trimNum(q.g, 1)} ${q.unit}</div>
          </div>
        </div>
        <div class="quest-right">
          <div class="quest-bar-mini">
            <div class="quest-bar-fill" style="width: ${Math.round(q.pct * 100)}%;"></div>
          </div>
          <span class="quest-check">${q.done ? '✓' : '○'}</span>
        </div>
      </div>
    `).join('');
  }

  function renderBoss() {
    const b = bossInfo();
    const ico = document.getElementById('boss-ico');
    const name = document.getElementById('boss-name');
    const title = document.getElementById('boss-title');
    const fill = document.getElementById('boss-hp-fill');
    const text = document.getElementById('boss-hp-text');
    const days = document.getElementById('boss-days-left');
    const reward = document.getElementById('boss-reward-badge');

    if (ico) ico.textContent = b.ico;
    if (name) name.textContent = b.name;
    if (title) title.textContent = b.title;
    if (reward) reward.textContent = `+${b.reward} XP`;

    const remainingHp = Math.max(0, b.hp - b.dmg);
    const pct = b.dead ? 0 : clamp(remainingHp / b.hp, 0, 1);

    if (fill) fill.style.width = `${Math.round(pct * 100)}%`;
    if (text) text.textContent = b.dead ? 'DEFEATED! Raid Cleared' : `HP: ${nf(remainingHp)} / ${nf(b.hp)}`;
    if (days) days.textContent = `${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} remaining`;
  }

  function renderChallenges() {
    const container = document.getElementById('challenges-list');
    const activeBadge = document.getElementById('ch-active-count');
    if (!container) return;

    ensureChallenges();
    const defs = activeDefs();
    const activeDefsList = defs.filter(d => !S.challenges[d.id] || !S.challenges[d.id].done);

    if (activeBadge) {
      activeBadge.textContent = `${activeDefsList.length} Active`;
    }

    container.innerHTML = defs.slice(0, 6).map(def => {
      const prog = challengeProgress(def);
      return `
        <div class="challenge-item ${prog.done ? 'done' : ''}">
          <div class="ch-head">
            <span class="ch-title">${def.ico} ${def.title}</span>
            <span class="ch-badge">${prog.done ? 'DONE' : `+${rewardOf(def.lvl)} XP`}</span>
          </div>
          <div class="ch-desc">${def.text}</div>
          <div class="ch-progress-wrap">
            <div class="ch-track">
              <div class="ch-fill" style="width: ${Math.round(prog.pct * 100)}%;"></div>
            </div>
            <span class="ch-pct">${Math.round(prog.pct * 100)}%</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderDiaryList() {
    const list = document.getElementById('diary-entries-list');
    if (!list) return;

    const entries = S.diary.slice().sort((a, b) => b.ts - a.ts);
    if (!entries.length) {
      list.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;">No reflection notes yet. Write a quick daily recap above!</div>`;
      return;
    }

    const MOOD_ICONS = { fire: '🔥', bolt: '⚡', ok: '😌', tired: '😴', stress: '🌪️' };

    list.innerHTML = entries.map(e => `
      <div class="diary-entry-card" data-id="${e.id}">
        <div class="diary-entry-top">
          <span>${e.date}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="diary-mood-tag">${MOOD_ICONS[e.mood] || '😌'}</span>
            <button type="button" class="diary-delete-btn" data-id="${e.id}" title="Delete note">✕</button>
          </div>
        </div>
        <div class="diary-entry-text">${esc(e.text)}</div>
      </div>
    `).join('');

    // Attach delete handlers
    list.querySelectorAll('.diary-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteDiary(id);
        AudioFX.click();
        renderAll();
      });
    });
  }

  /* ==================== 7-SECOND ROTATING CATEGORY GRAPH ==================== */
  function initRotatingPerformanceGraph() {
    if (rotatingCycleTimer) clearInterval(rotatingCycleTimer);
    if (rotatingProgressTimer) clearInterval(rotatingProgressTimer);

    rotatingProgressMs = 0;
    const bar = document.getElementById('rotating-timer-bar');
    const card = document.querySelector('.rotating-graph-card');

    if (card) {
      card.addEventListener('mouseenter', () => { isRotatingPaused = true; });
      card.addEventListener('mouseleave', () => { isRotatingPaused = false; });
    }

    // Attach category pills click events
    document.querySelectorAll('#rotating-category-pills .category-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeRotatingCategory = btn.getAttribute('data-cat') || 'hours';
        rotatingProgressMs = 0;
        if (bar) bar.style.width = '0%';
        renderRotatingPerformanceGraph();
        AudioFX.click();
      });
    });

    // 100ms timer progress bar
    rotatingProgressTimer = setInterval(() => {
      if (isRotatingPaused) return;
      rotatingProgressMs += 100;
      if (bar) {
        const pct = Math.min(100, (rotatingProgressMs / 7000) * 100);
        bar.style.width = `${pct}%`;
      }
    }, 100);

    // 7000ms category switcher
    rotatingCycleTimer = setInterval(() => {
      if (isRotatingPaused) return;
      rotatingProgressMs = 0;
      const cats = ['hours', 'mcq', 'water'];
      const curIdx = cats.indexOf(activeRotatingCategory);
      activeRotatingCategory = cats[(curIdx + 1) % cats.length];
      renderRotatingPerformanceGraph();
    }, 7000);
  }

  function renderRotatingPerformanceGraph() {
    const container = document.getElementById('rotating-chart-container');
    const summaryBox = document.getElementById('rotating-stats-summary');
    if (!container) return;

    // Update active pill styling
    document.querySelectorAll('#rotating-category-pills .category-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cat') === activeRotatingCategory);
    });

    const catInfo = ROTATING_CATEGORIES.find(c => c.key === activeRotatingCategory) || ROTATING_CATEGORIES[0];
    const data = calcRotatingPerformanceData(activeRotatingCategory);

    // Update summary metrics strip
    if (summaryBox) {
      summaryBox.innerHTML = `
        <div class="summary-stat-item">
          <span class="summary-stat-label">7-Day Total</span>
          <span class="summary-stat-val" style="color: ${catInfo.color};">${data.total} <small style="font-size: 12px; color: var(--text-muted);">${catInfo.unit}</small></span>
        </div>
        <div class="summary-stat-item">
          <span class="summary-stat-label">Daily Average</span>
          <span class="summary-stat-val">${data.avg} <small style="font-size: 12px; color: var(--text-muted);">${catInfo.unit}/day</small></span>
        </div>
        <div class="summary-stat-item">
          <span class="summary-stat-label">Peak Day</span>
          <span class="summary-stat-val" style="color: #ffc94d;">${data.bestDay ? `${data.bestDay.label}: ${data.bestDay.val}` : '--'}</span>
        </div>
      `;
    }

    // Generate Animated SVG Bar and Area Line Chart
    const svgW = 460;
    const svgH = 190;
    const padL = 36;
    const padR = 20;
    const padT = 24;
    const padB = 36;
    const chartW = svgW - padL - padR;
    const chartH = svgH - padT - padB;

    const maxVal = Math.max(1, data.maxVal);
    const stepX = chartW / (data.days.length - 1 || 1);

    const points = data.days.map((d, i) => {
      const x = padL + i * stepX;
      const y = padT + chartH - (d.val / maxVal) * chartH;
      return { x, y, val: d.val, label: d.label, date: d.date };
    });

    const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`, '');
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)} L ${points[0].x.toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

    const barWidth = 24;
    let barsHtml = '';
    points.forEach(pt => {
      const bh = (pt.val / maxVal) * chartH;
      const by = padT + chartH - bh;
      barsHtml += `
        <rect x="${(pt.x - barWidth / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barWidth}" height="${bh.toFixed(1)}"
              rx="4" fill="${catInfo.color}" opacity="0.22" style="transition: all 0.35s ease;" />
        <text x="${pt.x.toFixed(1)}" y="${(padT + chartH + 18).toFixed(1)}" text-anchor="middle"
              fill="#9ca3af" font-size="11" font-weight="600" font-family="'Outfit', sans-serif">
          ${pt.label}
        </text>
        <text x="${pt.x.toFixed(1)}" y="${Math.max(16, pt.y - 8).toFixed(1)}" text-anchor="middle"
              fill="#fff" font-size="11" font-weight="700" font-family="'Outfit', sans-serif">
          ${pt.val}
        </text>
      `;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${svgW} ${svgH}" class="analytics-chart-svg" style="width: 100%; height: auto; overflow: visible;">
        <defs>
          <linearGradient id="rotGrad-${catInfo.key}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${catInfo.color}" stop-opacity="0.45" />
            <stop offset="100%" stop-color="${catInfo.color}" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Horizontal grid guides -->
        <line x1="${padL}" y1="${padT}" x2="${svgW - padR}" y2="${padT}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <line x1="${padL}" y1="${padT + chartH / 2}" x2="${svgW - padR}" y2="${padT + chartH / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <line x1="${padL}" y1="${padT + chartH}" x2="${svgW - padR}" y2="${padT + chartH}" stroke="rgba(255,255,255,0.12)" />

        <!-- Bars -->
        ${barsHtml}

        <!-- Gradient Area & Line -->
        <path d="${areaD}" fill="url(#rotGrad-${catInfo.key})" />
        <path d="${pathD}" fill="none" stroke="${catInfo.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Data Point Nodes -->
        ${points.map(pt => `
          <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="#fff" stroke="${catInfo.color}" stroke-width="2.5" />
        `).join('')}
      </svg>
    `;
  }

  /* ==================== BIOMETRIC VITALS SUITE ==================== */
  function renderVitals() {
    const v = getVitals();
    const hrVal = document.getElementById('vital-hr-val');
    const bpVal = document.getElementById('vital-bp-val');
    const sugarVal = document.getElementById('vital-sugar-val');
    const stressVal = document.getElementById('vital-stress-val');
    const spo2Val = document.getElementById('vital-spo2-val');

    if (hrVal) hrVal.textContent = v.hr;
    if (bpVal) bpVal.textContent = `${v.bpSys}/${v.bpDia}`;
    if (sugarVal) sugarVal.textContent = v.sugar;
    if (stressVal) stressVal.textContent = v.stress;
    if (spo2Val) spo2Val.textContent = v.spo2;

    const hrTag = document.getElementById('vital-hr-tag');
    if (hrTag) {
      if (v.hr <= 80) { hrTag.textContent = 'Resting Target (60-80)'; hrTag.className = 'vital-tag optimal'; }
      else if (v.hr <= 100) { hrTag.textContent = 'Normal Active Zone'; hrTag.className = 'vital-tag optimal'; }
      else { hrTag.textContent = 'Elevated BPM'; hrTag.className = 'vital-tag warning'; }
    }

    const bpTag = document.getElementById('vital-bp-tag');
    if (bpTag) {
      if (v.bpSys <= 120 && v.bpDia <= 80) { bpTag.textContent = 'Optimal (< 120/80)'; bpTag.className = 'vital-tag optimal'; }
      else if (v.bpSys <= 130) { bpTag.textContent = 'Normal Normal'; bpTag.className = 'vital-tag optimal'; }
      else { bpTag.textContent = 'Elevated BP'; bpTag.className = 'vital-tag warning'; }
    }

    const sugarTag = document.getElementById('vital-sugar-tag');
    if (sugarTag) {
      if (v.sugar <= 99) { sugarTag.textContent = 'Fasting Normal (70-99)'; sugarTag.className = 'vital-tag optimal'; }
      else if (v.sugar <= 140) { sugarTag.textContent = 'Post-Meal Target'; sugarTag.className = 'vital-tag optimal'; }
      else { sugarTag.textContent = 'Elevated Glucose'; sugarTag.className = 'vital-tag warning'; }
    }

    const stressTag = document.getElementById('vital-stress-tag');
    if (stressTag) {
      if (v.stress <= 30) { stressTag.textContent = 'Low / Calm State'; stressTag.className = 'vital-tag low-stress'; }
      else if (v.stress <= 60) { stressTag.textContent = 'Moderate Stress'; stressTag.className = 'vital-tag optimal'; }
      else { stressTag.textContent = 'High Stress Alert'; stressTag.className = 'vital-tag warning'; }
    }

    const overallStatus = document.getElementById('vitals-overall-status');
    if (overallStatus) {
      const isGood = v.hr <= 100 && v.bpSys <= 130 && v.stress <= 60;
      overallStatus.innerHTML = isGood
        ? `<span class="live-pulse-dot"></span> All Systems Optimal`
        : `<span class="live-pulse-dot" style="background:#facc15;box-shadow:0 0 8px #facc15;"></span> Recovery Recommended`;
    }
  }

  function renderHabitQuickSummary() {
    const box = document.getElementById('habit-quick-summary-pills');
    if (!box) return;
    if (!S.badHabits || !S.badHabits.length) {
      box.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">No active clean streaks. Click button above to start!</span>`;
      return;
    }
    box.innerHTML = S.badHabits.map(h => {
      const dur = getBadHabitDuration(h);
      return `<span class="habit-badge-pill">${h.ico} ${esc(h.name)}: <strong>${dur.days}d ${dur.hours}h clean</strong></span>`;
    }).join('');
  }

  function renderAchievementsPreview() {
    const box = document.getElementById('achievements-preview-list');
    if (!box) return;
    if (!S.lifeAchievements || !S.lifeAchievements.length) {
      box.innerHTML = `
        <div style="font-size: 13px; color: var(--text-muted); padding: 8px 0;">
          No hall of fame achievements recorded yet. Click above to record lifetime milestones!
        </div>
      `;
      return;
    }
    box.innerHTML = S.lifeAchievements.slice(-4).reverse().map(a => `
      <div class="habit-badge-pill" style="border-color: rgba(255, 201, 77, 0.4); background: rgba(255, 201, 77, 0.1);">
        <span>${a.ico || '🏆'}</span>
        <span style="color: #fff; font-weight: 700;">${esc(a.title)}</span>
        <span style="color: var(--gold); font-size: 11px;">${a.date}</span>
      </div>
    `).join('');
  }

  function renderHabitQuitter() {
    const container = document.getElementById('habit-quitter-list');
    if (!container) return;

    if (!S.badHabits || !S.badHabits.length) {
      container.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 14px;">No bad habits added yet. Start a clean streak below!</div>`;
      return;
    }

    container.innerHTML = S.badHabits.map(h => {
      const dur = getBadHabitDuration(h);
      const is24h = dur.totalHours >= 24;
      const is3d = dur.days >= 3;
      const is7d = dur.days >= 7;
      const is30d = dur.days >= 30;

      return `
        <div class="habit-quit-card" data-id="${h.id}">
          <div class="habit-quit-header">
            <div class="habit-name-box">
              <div class="habit-ico">${h.ico}</div>
              <div>
                <div style="font-weight: 800; font-size: 14px; color: #fff;">${esc(h.name)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Relapses: ${h.relapses ? h.relapses.length : 0}</div>
              </div>
            </div>
            <button type="button" class="btn-delete-entry btn-delete-habit" data-id="${h.id}" title="Remove habit tracker">✕</button>
          </div>

          <div class="clean-timer-box">
            <div>
              <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 2px;">Clean Streak</div>
              <div class="clean-timer-digits">${dur.days}d ${pad2(dur.hours)}h ${pad2(dur.mins)}m</div>
            </div>
            <div class="resists-badge">💪 ${h.resists || 0} Urges Resisted</div>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <span class="card-badge" style="${is24h ? 'color: #2bd47d; border: 1px solid rgba(43,212,125,0.4);' : 'opacity: 0.4;'}">24h Clean</span>
            <span class="card-badge" style="${is3d ? 'color: #2bd47d; border: 1px solid rgba(43,212,125,0.4);' : 'opacity: 0.4;'}">3 Days</span>
            <span class="card-badge" style="${is7d ? 'color: #ffc94d; border: 1px solid rgba(255,201,77,0.4);' : 'opacity: 0.4;'}">1 Week 🔥</span>
            <span class="card-badge" style="${is30d ? 'color: var(--orange-500); border: 1px solid rgba(var(--accent-rgb), 0.4);' : 'opacity: 0.4;'}">1 Month 👑</span>
          </div>

          <div class="habit-action-row">
            <button type="button" class="btn-resist" data-id="${h.id}">⚡ I Resisted an Urge! (+15 XP)</button>
            <button type="button" class="btn-relapse" data-id="${h.id}">Relapsed (Reset)</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach Habit Quitter Listeners
    container.querySelectorAll('.btn-resist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        const res = resistBadHabit(id);
        if (res) {
          AudioFX.questComplete();
          spawnFloatingXp(e.clientX, e.clientY, '+15 XP', false);
          showToast('🔥 Discipline forged! Urge successfully resisted (+15 XP).');
          renderHabitQuitter();
          renderHUD();
          handleGameEvents(res.evts);
        }
      });
    });

    container.querySelectorAll('.btn-relapse').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Did you slip up? Resetting clean timer. Remember: recovery is a marathon, not a sprint. Dust yourself off!')) {
          const res = relapseBadHabit(id, 'User reported slip');
          if (res) {
            AudioFX.penalty();
            showToast('⚠️ Resetting clean streak. Get back up and stay strong!');
            renderHabitQuitter();
            renderHUD();
            handleGameEvents(res.evts);
          }
        }
      });
    });

    container.querySelectorAll('.btn-delete-habit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Delete this habit tracker?')) {
          deleteBadHabit(id);
          AudioFX.click();
          renderHabitQuitter();
        }
      });
    });
  }

  function renderLifeAchievements() {
    const container = document.getElementById('achievements-list');
    if (!container) return;

    if (!S.lifeAchievements || !S.lifeAchievements.length) {
      container.innerHTML = `<div style="grid-column: 1 / -1; font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px;">No milestone trophies recorded yet. Enter a proud life achievement above!</div>`;
      return;
    }

    container.innerHTML = S.lifeAchievements.map(ach => `
      <div class="trophy-card" data-id="${ach.id}">
        <div class="trophy-top">
          <span class="trophy-cat-tag">${esc(ach.category || 'General')}</span>
          <span class="trophy-date">${ach.date}</span>
        </div>
        <div class="trophy-title">${esc(ach.title)}</div>
        ${ach.desc ? `<div class="trophy-desc">${esc(ach.desc)}</div>` : ''}
        <div class="trophy-footer">
          <span style="color: var(--gold); font-weight: 700;">+${ach.xp} XP Milestone</span>
          <button type="button" class="btn-delete-entry btn-delete-ach" data-id="${ach.id}" title="Delete achievement">✕</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-delete-ach').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Remove this achievement from your Hall of Fame?')) {
          deleteLifeAchievement(id);
          AudioFX.click();
          renderLifeAchievements();
          renderHUD();
        }
      });
    });
  }

  /* ==================== GAME EVENTS HANDLER ==================== */
  function handleGameEvents(evts) {
    if (!evts || !evts.length) return;

    evts.forEach(evt => {
      if (evt.t === 'levelup') {
        // Trigger Level Up Modal & Confetti
        AudioFX.levelUp();
        launchConfetti();
        if (sprite) sprite.play('cheer', 3.0);

        const modal = document.getElementById('modal-levelup');
        const title = document.getElementById('levelup-title');
        const msg = document.getElementById('levelup-msg');
        const gearBox = document.getElementById('levelup-gear-box');
        const gearName = document.getElementById('levelup-gear-name');

        if (title) title.textContent = `LEVEL UP! REACHED LVL ${evt.level}`;
        if (msg) msg.textContent = evt.rankUp ? `Congratulations! You unlocked the rank of ${evt.rankUp.name}!` : `You have ascending to Level ${evt.level}! Keep crushing it!`;

        if (evt.gear && evt.gear.length > 0 && gearBox && gearName) {
          gearBox.style.display = 'block';
          gearName.textContent = `${evt.gear[0].ico} ${evt.gear[0].name}`;
        } else if (gearBox) {
          gearBox.style.display = 'none';
        }

        if (modal) modal.classList.add('active');
      } else if (evt.t === 'boss') {
        AudioFX.questComplete();
        launchConfetti();
        showToast(`⚔️ BOSS SLAIN! You conquered ${evt.name} and earned +${evt.reward} XP!`);
      } else if (evt.t === 'challenge') {
        AudioFX.questComplete();
        showToast(`🏆 Challenge Complete: ${evt.def.title} (+${evt.reward} XP)!`);
      } else if (evt.t === 'clear') {
        AudioFX.questComplete();
        showToast(`🌟 Daily Habit Sweep! 5+ quests completed (+${evt.bonus} XP)!`);
      }
    });
  }

  /* ==================== FLOATING XP PARTICLES ==================== */
  function spawnFloatingXp(x, y, text, isNegative) {
    const el = document.createElement('div');
    el.className = `floating-xp ${isNegative ? 'negative' : 'positive'}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1300);
  }

  /* ==================== CONFETTI CANNON ==================== */
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // First colours follow the current lighting theme (see js/lighting.js)
    const themed = (typeof EmberLighting !== 'undefined') ? EmberLighting.palette() : ['#ff7a1a', '#ff9440'];
    const colors = [...themed, '#ffc94d', '#2bd47d', '#ff4747', '#ffffff'];
    confettiParticles = [];

    for (let i = 0; i < 90; i++) {
      confettiParticles.push({
        x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.4,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);

    function updateConfetti() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.rotation += p.vRot;
        p.opacity -= 0.008;

        if (p.opacity > 0 && p.y < canvas.height) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });

      if (alive) {
        confettiAnimId = requestAnimationFrame(updateConfetti);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    confettiAnimId = requestAnimationFrame(updateConfetti);
  }

  /* ==================== TOAST NOTIFICATIONS ==================== */
  function showToast(msg) {
    let container = document.getElementById('toast-box');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-box';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: rgba(20, 20, 28, 0.95);
      border: 1px solid var(--orange-500);
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 15px var(--orange-glow);
      pointer-events: auto;
      animation: floatUpFade 0.3s forwards;
      max-width: 360px;
    `;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
  }

  /* ==================== TIMER DISPLAY HELPER ==================== */
  function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const h = Math.floor(timerSeconds / 3600);
    const m = Math.floor((timerSeconds % 3600) / 60);
    const s = timerSeconds % 60;
    el.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function updateSoundBtn() {
    const btn = document.getElementById('btn-sound-toggle');
    if (!btn) return;
    const on = AudioFX.isEnabled();
    btn.textContent = on ? '🔊' : '🔇';
    btn.classList.toggle('active', on);
  }

  function openProfileModal(isNew) {
    const modal = document.getElementById('modal-profile');
    const title = document.getElementById('profile-modal-title');
    const nameInput = document.getElementById('profile-name');
    const ageInput = document.getElementById('profile-age');

    if (title) title.textContent = isNew ? 'Create Your Hero' : 'Edit Hero Profile';
    if (nameInput) nameInput.value = S && S.profile ? S.profile.name : '';
    if (ageInput) ageInput.value = S && S.profile ? S.profile.age : 20;

    selectedGender = S && S.profile && S.profile.gender ? S.profile.gender : 'male';
    document.querySelectorAll('#gender-options .gender-tab-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-gender') === selectedGender);
    });

    selectedSkin = S && S.profile && S.profile.skin != null ? S.profile.skin : 0;
    document.querySelectorAll('#skin-options .color-swatch-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.getAttribute('data-skin'), 10) === selectedSkin);
    });

    selectedHair = S && S.profile && S.profile.hair != null ? S.profile.hair : 0;
    document.querySelectorAll('#hair-options .color-swatch-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.getAttribute('data-hair'), 10) === selectedHair);
    });

    if (modal) modal.classList.add('active');
  }

  // Expose global render hooks for analytics modal
  window.renderActivities = renderActivities;
  window.renderAll = renderAll;

  // Periodic clean timer update for Habit Quitter
  setInterval(() => {
    const modal = document.getElementById('modal-habit-quitter');
    if (modal && modal.classList.contains('active')) {
      renderHabitQuitter();
    }
  }, 30000);

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

/* ==================== MOTIVATIONAL QUOTES ENGINE ==================== */
(function() {
  const QUOTES = [
    { text: "The only bad workout is the one that didn't happen.", author: "— Unknown" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "— Robert Collier" },
    { text: "Don't limit your challenges — challenge your limits.", author: "— Unknown" },
    { text: "The body achieves what the mind believes.", author: "— Unknown" },
    { text: "You don't have to be extreme, just consistent.", author: "— Unknown" },
    { text: "Fall in love with the process and the results will come.", author: "— Eric Thomas" },
    { text: "Champions aren't made in gyms. Champions are made from something deep inside them.", author: "— Muhammad Ali" },
    { text: "Pain is temporary. Quitting lasts forever.", author: "— Lance Armstrong" },
    { text: "Take care of your body. It's the only place you have to live.", author: "— Jim Rohn" },
    { text: "What seems impossible today will one day become your warm-up.", author: "— Unknown" },
    { text: "The difference between try and triumph is a little 'umph'.", author: "— Marvin Phillips" },
    { text: "Discipline is choosing between what you want now and what you want most.", author: "— Augusta F. Kantra" },
    { text: "Your future self is watching you right now through your memories.", author: "— Aubrey de Grey" },
    { text: "Be so good they can't ignore you.", author: "— Steve Martin" },
    { text: "The man who moves a mountain begins by carrying away small stones.", author: "— Confucius" },
    { text: "Push yourself because no one else is going to do it for you.", author: "— Unknown" },
    { text: "Wake up with determination. Go to bed with satisfaction.", author: "— Unknown" },
    { text: "It always seems impossible until it's done.", author: "— Nelson Mandela" },
    { text: "Great things never come from comfort zones.", author: "— Unknown" },
    { text: "The secret to getting ahead is getting started.", author: "— Mark Twain" },
    { text: "Work hard in silence, let your success be your noise.", author: "— Frank Ocean" },
    { text: "Motivation gets you started. Habit keeps you going.", author: "— Jim Ryun" },
    { text: "Your only limit is your mind.", author: "— Unknown" },
    { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "— Unknown" },
    { text: "Don't wish for it. Work for it.", author: "— Unknown" },
  ];

  let currentQuoteIdx = 0;
  let quoteTimer = null;
  let quoteRingTimer = null;
  let quoteCountdownMs = 7000;
  const QUOTE_INTERVAL = 7000;

  function initQuotes() {
    renderQuoteDots();
    showQuote(currentQuoteIdx, false);
    startQuoteCycle();
  }

  function renderQuoteDots() {
    const dotsRow = document.getElementById('quotes-dots-row');
    if (!dotsRow) return;
    dotsRow.innerHTML = QUOTES.map((_, i) =>
      `<button class="quotes-dot${i === currentQuoteIdx ? ' active' : ''}"
        aria-label="Quote ${i+1}" data-qidx="${i}"></button>`
    ).join('');
    dotsRow.querySelectorAll('.quotes-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.qidx, 10);
        jumpToQuote(idx);
      });
    });
  }

  function updateDots() {
    document.querySelectorAll('.quotes-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentQuoteIdx);
    });
  }

  function showQuote(idx, animate) {
    const textEl = document.getElementById('motivational-quote-text');
    const authEl = document.getElementById('motivational-quote-author');
    if (!textEl || !authEl) return;

    const q = QUOTES[idx];

    if (animate) {
      textEl.classList.add('fade-out');
      authEl.classList.add('fade-out');
      setTimeout(() => {
        textEl.textContent = `"${q.text}"`;
        authEl.textContent = q.author;
        textEl.classList.remove('fade-out');
        authEl.classList.remove('fade-out');
        textEl.classList.add('fade-in');
        authEl.classList.add('fade-in');
        setTimeout(() => {
          textEl.classList.remove('fade-in');
          authEl.classList.remove('fade-in');
        }, 600);
      }, 500);
    } else {
      textEl.textContent = `"${q.text}"`;
      authEl.textContent = q.author;
    }
  }

  function jumpToQuote(idx) {
    clearInterval(quoteTimer);
    clearInterval(quoteRingTimer);
    currentQuoteIdx = idx;
    updateDots();
    showQuote(currentQuoteIdx, true);
    quoteCountdownMs = QUOTE_INTERVAL;
    startQuoteCycle();
  }

  function startQuoteCycle() {
    quoteCountdownMs = QUOTE_INTERVAL;
    updateRing();

    quoteRingTimer = setInterval(() => {
      quoteCountdownMs -= 100;
      if (quoteCountdownMs < 0) quoteCountdownMs = 0;
      updateRing();
    }, 100);

    quoteTimer = setInterval(() => {
      currentQuoteIdx = (currentQuoteIdx + 1) % QUOTES.length;
      updateDots();
      showQuote(currentQuoteIdx, true);
      quoteCountdownMs = QUOTE_INTERVAL;
    }, QUOTE_INTERVAL);
  }

  function updateRing() {
    const ringFill = document.getElementById('quotes-ring-fill');
    const ringLabel = document.getElementById('quotes-ring-label');
    if (!ringFill || !ringLabel) return;
    const progress = quoteCountdownMs / QUOTE_INTERVAL; // 1 → 0
    // stroke-dasharray="100 100", offset goes from 0 (full) to 100 (empty)
    const offset = (1 - progress) * 100;
    ringFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
    const secs = Math.ceil(quoteCountdownMs / 1000);
    ringLabel.textContent = secs + 's';
  }

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuotes);
  } else {
    initQuotes();
  }
})();

/* ==================== GOAL CALENDAR & COUNTDOWN ENGINE ==================== */
(function() {
  const STORAGE_KEY = 'emberquest_goal_calendars';
  let goals = [];
  let countdownInterval = null;

  function loadGoals() {
    try {
      goals = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch(e) {
      goals = [];
    }
  }

  function saveGoals() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }

  function addGoal(name, dateStr) {
    if (!name || !dateStr) return false;
    const targetTs = new Date(dateStr).getTime();
    if (isNaN(targetTs)) return false;
    goals.push({ id: Date.now(), name: name.trim(), dateStr, targetTs });
    saveGoals();
    return true;
  }

  function deleteGoal(id) {
    goals = goals.filter(g => g.id !== id);
    saveGoals();
    renderGoalList();
  }

  function getCountdown(targetTs) {
    const now = Date.now();
    const diff = targetTs - now;
    if (diff <= 0) return null; // expired
    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return { days, hours, mins, secs };
  }

  function pad(n, digits) {
    return String(n).padStart(digits, '0');
  }

  function renderGoalList() {
    const container = document.getElementById('goal-countdown-list');
    if (!container) return;

    if (goals.length === 0) {
      container.innerHTML = `
        <div class="goal-empty-state">
          <span class="goal-empty-state-ico">📅</span>
          No goal deadlines set yet.<br>Add your first goal above to start the countdown!
        </div>`;
      return;
    }

    container.innerHTML = goals.map(goal => {
      const cd = getCountdown(goal.targetTs);
      const expired = !cd;
      const dateLabel = new Date(goal.dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
      });

      const days = expired ? '00' : pad(cd.days, 2);
      const hours = expired ? '00' : pad(cd.hours, 2);
      const mins = expired ? '00' : pad(cd.mins, 2);
      const secs = expired ? '00' : pad(cd.secs, 2);

      return `
        <div class="goal-countdown-card${expired ? ' expired' : ''}" data-goal-id="${goal.id}">
          <div class="goal-countdown-header">
            <div>
              <div class="goal-countdown-name">🎯 ${goal.name}</div>
              <div class="goal-countdown-date-tag">Target: ${dateLabel}</div>
            </div>
            <button class="goal-countdown-delete-btn" data-del-id="${goal.id}" title="Remove goal">✕</button>
          </div>
          <div class="goal-countdown-digits">
            <div class="countdown-digit-block">
              <div class="countdown-digit-number" id="cd-days-${goal.id}">${days}</div>
              <div class="countdown-digit-label">Days</div>
            </div>
            <div class="countdown-digit-block">
              <div class="countdown-digit-number" id="cd-hours-${goal.id}">${hours}</div>
              <div class="countdown-digit-label">Hours</div>
            </div>
            <div class="countdown-digit-block">
              <div class="countdown-digit-number" id="cd-mins-${goal.id}">${mins}</div>
              <div class="countdown-digit-label">Mins</div>
            </div>
            <div class="countdown-digit-block">
              <div class="countdown-digit-number" id="cd-secs-${goal.id}">${secs}</div>
              <div class="countdown-digit-label">Secs</div>
            </div>
          </div>
        </div>`;
    }).join('');

    // Bind delete buttons
    container.querySelectorAll('.goal-countdown-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteGoal(parseInt(btn.dataset.delId, 10));
      });
    });
  }

  function tickCountdowns() {
    goals.forEach(goal => {
      const cd = getCountdown(goal.targetTs);
      const card = document.querySelector(`.goal-countdown-card[data-goal-id="${goal.id}"]`);
      if (!card) return;

      if (!cd) {
        // Just became expired
        if (!card.classList.contains('expired')) {
          card.classList.add('expired');
          ['days','hours','mins','secs'].forEach(key => {
            const el = document.getElementById(`cd-${key}-${goal.id}`);
            if (el) el.textContent = '00';
          });
        }
        return;
      }

      const daysEl = document.getElementById(`cd-days-${goal.id}`);
      const hoursEl = document.getElementById(`cd-hours-${goal.id}`);
      const minsEl = document.getElementById(`cd-mins-${goal.id}`);
      const secsEl = document.getElementById(`cd-secs-${goal.id}`);

      if (daysEl) daysEl.textContent = pad(cd.days, 2);
      if (hoursEl) hoursEl.textContent = pad(cd.hours, 2);
      if (minsEl) minsEl.textContent = pad(cd.mins, 2);
      if (secsEl) secsEl.textContent = pad(cd.secs, 2);
    });
  }

  function initGoalCalendar() {
    loadGoals();
    renderGoalList();

    // Set min date to today
    const dateInput = document.getElementById('goal-calendar-date-input');
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
    }

    // Set Goal button
    const btn = document.getElementById('btn-set-goal-calendar');
    if (btn) {
      btn.addEventListener('click', () => {
        const labelInput = document.getElementById('goal-calendar-label-input');
        const dateInp = document.getElementById('goal-calendar-date-input');
        if (!labelInput || !dateInp) return;
        const name = labelInput.value.trim();
        const dateStr = dateInp.value;
        if (!name) { labelInput.focus(); return; }
        if (!dateStr) { dateInp.focus(); return; }
        if (addGoal(name, dateStr)) {
          labelInput.value = '';
          dateInp.value = '';
          renderGoalList();
        }
      });
    }

    // Tick every second
    countdownInterval = setInterval(tickCountdowns, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoalCalendar);
  } else {
    initGoalCalendar();
  }
})();
