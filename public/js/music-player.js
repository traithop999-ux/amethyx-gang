(function () {
  const STORAGE_KEY = 'gang_music_state';
  const AUDIO_SRC = '/audio/gang-song.mp3';
  const audioId = 'bgMusic';
  const buttonId = 'musicToggleBtn';

  let hasUserInteracted = false;
  let audio = document.getElementById(audioId);
  let musicBtn = document.getElementById(buttonId);

  function createPlayer() {
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = audioId;
      audio.loop = true;
      audio.preload = 'auto';
      audio.src = AUDIO_SRC;
      document.body.appendChild(audio);
    }

    if (!musicBtn) {
      musicBtn = document.createElement('div');
      musicBtn.id = buttonId;
      musicBtn.className = 'floating-music-player';
      musicBtn.innerHTML = '<button class="music-btn" type="button"><i class="fa-solid fa-music"></i></button>';
      musicBtn.querySelector('button').addEventListener('click', toggleMusic);
      document.body.appendChild(musicBtn);
    }
  }

  function updateButtonState() {
    if (!musicBtn) return;
    const btn = musicBtn.querySelector('button') || musicBtn;
    if (!btn) return;
    if (!audio.paused) {
      btn.classList.add('music-playing');
    } else {
      btn.classList.remove('music-playing');
    }
  }

  function saveState() {
    // Debounced write to localStorage to avoid frequent synchronous IO
    try {
      if (typeof saveState._timeout !== 'undefined') clearTimeout(saveState._timeout);
    } catch (e) {}
    saveState._timeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          playing: !audio.paused,
          currentTime: audio.currentTime || 0
        }));
      } catch (err) {
        console.warn('Unable to save music state:', err);
      }
    }, 800);
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved.currentTime === 'number') {
        audio.currentTime = Math.max(0, saved.currentTime);
      }
      return saved;
    } catch (err) {
      console.warn('Unable to load music state:', err);
      return {};
    }
  }

  function startMusic(force = false) {
    if (!audio) return;
    if (!hasUserInteracted && !force) return;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.then(() => {
        updateButtonState();
        saveState();
      }).catch((err) => {
        console.log('Music play blocked:', err);
      });
    }
  }

  function toggleMusic() {
    hasUserInteracted = true;
    if (audio.paused) {
      startMusic(true);
    } else {
      audio.pause();
      saveState();
      updateButtonState();
    }
  }

  function attachListeners() {
    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((eventName) => {
      document.addEventListener(eventName, () => {
        if (!hasUserInteracted) {
          hasUserInteracted = true;
          startMusic(true);
        }
      }, { passive: true });
    });

    window.addEventListener('beforeunload', saveState);
    window.addEventListener('pagehide', saveState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveState();
      }
    });

    audio.addEventListener('play', updateButtonState);
    audio.addEventListener('pause', updateButtonState);
    audio.addEventListener('timeupdate', saveState);
  }

  function init() {
    createPlayer();
    audio.volume = 0.15;
    audio.preload = 'auto';
    const saved = loadState();
    if (saved.playing) {
      audio.currentTime = Math.max(0, saved.currentTime || 0);
      startMusic(true);
    }
    attachListeners();
    updateButtonState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
