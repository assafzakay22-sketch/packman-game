(() => {
  'use strict';

  const TILE = 32;
  const STEP_MS = 145;
  const GHOST_STEP_MS = 390;
  const POWER_DURATION = 7000;
  const START = { x: 1, y: 1 };
  const GHOST_STARTS = [
    { x: 9, y: 9, color: '#ff5e79' },
    { x: 10, y: 9, color: '#55d9f2' },
  ];
  const MAP = [
    '###################',
    '#.................#',
    '#.###...#...###...#',
    '#.....#...#.......#',
    '###.#.#.#.#.#.###.#',
    '#...#...#...#.....#',
    '#.###.###.###.###.#',
    '#.....#.....#.....#',
    '#.###.#.###.#.###.#',
    '#...#...........#.#',
    '#.###.#.###.#.###.#',
    '#.....#.....#.....#',
    '#.###.###.###.###.#',
    '#.....#...#...#...#',
    '###.#.#.#.#.#.#.###',
    '#...#...#...#.....#',
    '#.###...#...###...#',
    '#.................#',
    '###################',
  ];
  const POWER_SPOTS = [
    { x: 1, y: 3 },
    { x: 17, y: 3 },
    { x: 1, y: 15 },
    { x: 17, y: 15 },
  ];
  const DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const scoreElement = document.querySelector('#score');
  const dotsElement = document.querySelector('#dots');
  const livesElement = document.querySelector('#lives');
  const statusElement = document.querySelector('#game-status');
  const endScreen = document.querySelector('#end-screen');
  const endTitle = document.querySelector('#end-title');
  const endMessage = document.querySelector('#end-message');
  let dots;
  let powers;
  let player;
  let ghosts;
  let score;
  let lives;
  let remaining;
  let gameState;
  let poweredUntil;
  let stepTimer = 0;
  let ghostTimer = 0;
  let previousFrame = 0;
  let animationFrame = 0;

  function resetGame() {
    dots = MAP.map((row) => [...row].map((cell) => cell !== '#'));
    powers = new Set(POWER_SPOTS.map(({ x, y }) => `${x},${y}`));
    for (const key of powers) {
      const [x, y] = key.split(',').map(Number);
      dots[y][x] = false;
    }
    dots[START.y][START.x] = false;
    remaining = dots.reduce((count, row) => count + row.filter(Boolean).length, 0) + powers.size;
    player = { ...START, direction: { x: 0, y: 0 }, queuedDirection: { x: 0, y: 0 } };
    ghosts = GHOST_STARTS.map((ghost) => ({ ...ghost, x: ghost.x, y: ghost.y }));
    score = 0;
    lives = 3;
    poweredUntil = 0;
    stepTimer = 0;
    ghostTimer = 0;
    gameState = 'playing';
    endScreen.hidden = true;
    statusElement.textContent = 'Clear the maze. Watch out for the ghosts!';
    updateHud();
    draw();
  }

  function isOpen(x, y) {
    return y >= 0 && y < MAP.length && x >= 0 && x < MAP[y].length && MAP[y][x] !== '#';
  }

  function canMove(position, direction) {
    return isOpen(position.x + direction.x, position.y + direction.y);
  }

  function updateHud() {
    scoreElement.textContent = String(score).padStart(5, '0');
    dotsElement.textContent = String(remaining).padStart(3, '0');
    livesElement.textContent = `${'● '.repeat(lives).trim()}${lives ? '' : '—'}`;
    livesElement.setAttribute('aria-label', `${lives} lives remaining`);
  }

  function collect() {
    if (dots[player.y][player.x]) {
      dots[player.y][player.x] = false;
      score += 10;
      remaining -= 1;
    }
    const key = `${player.x},${player.y}`;
    if (powers.delete(key)) {
      score += 50;
      remaining -= 1;
      poweredUntil = performance.now() + POWER_DURATION;
      statusElement.textContent = 'Power up! The ghosts are vulnerable.';
    }
    if (remaining === 0) finishGame(true);
    updateHud();
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    if (lives <= 0) {
      finishGame(false);
      return;
    }
    player = { ...START, direction: { x: 0, y: 0 }, queuedDirection: { x: 0, y: 0 } };
    ghosts = GHOST_STARTS.map((ghost) => ({ ...ghost, x: ghost.x, y: ghost.y }));
    poweredUntil = 0;
    statusElement.textContent = 'Ouch! Keep going — you have another life.';
  }

  function checkCollisions(now) {
    if (gameState !== 'playing') return;
    for (const ghost of ghosts) {
      if (ghost.x !== player.x || ghost.y !== player.y) continue;
      if (now < poweredUntil) {
        score += 200;
        ghost.x = GHOST_STARTS[ghosts.indexOf(ghost)].x;
        ghost.y = GHOST_STARTS[ghosts.indexOf(ghost)].y;
        updateHud();
      } else {
        loseLife();
        return;
      }
    }
  }

  function moveGhost(ghost) {
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const reverse = { x: -ghost.direction?.x, y: -ghost.direction?.y };
    let choices = directions.filter((direction) =>
      canMove(ghost, direction) && !(direction.x === reverse.x && direction.y === reverse.y),
    );
    if (choices.length === 0) choices = directions.filter((direction) => canMove(ghost, direction));
    if (choices.length === 0) return;

    const fleeing = performance.now() < poweredUntil;
    if (Math.random() < 0.65) {
      choices.sort((a, b) => {
        const distanceA = Math.abs(ghost.x + a.x - player.x) + Math.abs(ghost.y + a.y - player.y);
        const distanceB = Math.abs(ghost.x + b.x - player.x) + Math.abs(ghost.y + b.y - player.y);
        return fleeing ? distanceB - distanceA : distanceA - distanceB;
      });
      ghost.direction = choices[0];
    } else {
      ghost.direction = choices[Math.floor(Math.random() * choices.length)];
    }
    ghost.x += ghost.direction.x;
    ghost.y += ghost.direction.y;
  }

  function update(delta) {
    if (gameState !== 'playing') return;
    const now = performance.now();
    if (now >= poweredUntil && statusElement.textContent.startsWith('Power up!')) {
      statusElement.textContent = 'Clear the maze. Watch out for the ghosts!';
    }
    stepTimer += delta;
    ghostTimer += delta;
    if (stepTimer >= STEP_MS) {
      stepTimer %= STEP_MS;
      if (canMove(player, player.queuedDirection)) {
        player.direction = player.queuedDirection;
      }
      if (canMove(player, player.direction)) {
        player.x += player.direction.x;
        player.y += player.direction.y;
        collect();
        checkCollisions(now);
      }
    }
    if (ghostTimer >= GHOST_STEP_MS && gameState === 'playing') {
      ghostTimer %= GHOST_STEP_MS;
      for (const ghost of ghosts) moveGhost(ghost);
      checkCollisions(now);
    }
  }

  function drawWall(x, y) {
    const inset = 2;
    ctx.fillStyle = '#14203f';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.strokeStyle = '#3556a4';
    ctx.lineWidth = 1.7;
    ctx.strokeRect(x * TILE + inset, y * TILE + inset, TILE - inset * 2, TILE - inset * 2);
  }

  function draw() {
    ctx.fillStyle = '#080c19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const powered = now < poweredUntil;
    for (let y = 0; y < MAP.length; y += 1) {
      for (let x = 0; x < MAP[y].length; x += 1) {
        if (MAP[y][x] === '#') {
          drawWall(x, y);
        } else if (dots[y][x]) {
          ctx.beginPath();
          ctx.fillStyle = '#f7dba1';
          ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const key of powers) {
      const [x, y] = key.split(',').map(Number);
      const radius = 5 + Math.sin(now / 150) * 1.2;
      ctx.beginPath();
      ctx.fillStyle = '#fff4d2';
      ctx.shadowColor = '#ffd93d';
      ctx.shadowBlur = 12;
      ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ghosts.forEach((ghost) => drawGhost(ghost, powered, now));
    drawPlayer(now);
  }

  function drawPlayer(now) {
    const centerX = player.x * TILE + TILE / 2;
    const centerY = player.y * TILE + TILE / 2;
    const direction = player.direction.x === 0 && player.direction.y === 0
      ? { x: 1, y: 0 }
      : player.direction;
    const angle = Math.atan2(direction.y, direction.x);
    const opening = 0.12 + Math.abs(Math.sin(now / 75)) * 0.34;
    ctx.beginPath();
    ctx.fillStyle = '#ffd93d';
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, 12, angle + opening, angle - opening + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ghost, powered, now) {
    const x = ghost.x * TILE + TILE / 2;
    const y = ghost.y * TILE + TILE / 2;
    const color = powered ? (Math.floor(now / 220) % 2 ? '#5272dc' : '#a4b7ff') : ghost.color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 1, 11, Math.PI, 0);
    ctx.lineTo(x + 11, y + 10);
    ctx.lineTo(x + 5, y + 7);
    ctx.lineTo(x, y + 11);
    ctx.lineTo(x - 5, y + 7);
    ctx.lineTo(x - 11, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 1, 3.2, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4, y - 1, 3.2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222c52';
    ctx.beginPath();
    ctx.arc(x - 4, y, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 4, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function finishGame(won) {
    if (gameState !== 'playing') return;
    gameState = won ? 'won' : 'lost';
    endTitle.textContent = won ? 'Maze cleared!' : 'Game over';
    endMessage.textContent = won
      ? `You scored ${score.toLocaleString()} points.`
      : `You scored ${score.toLocaleString()} points. Give it another try!`;
    endScreen.hidden = false;
    statusElement.textContent = won ? 'You cleared the maze!' : 'All lives used. Start a new game to try again.';
  }

  function gameLoop(timestamp) {
    const delta = previousFrame ? Math.min(timestamp - previousFrame, 100) : 0;
    previousFrame = timestamp;
    update(delta);
    draw();
    animationFrame = window.requestAnimationFrame(gameLoop);
  }

  window.addEventListener('keydown', (event) => {
    const direction = DIRECTIONS[event.key] || DIRECTIONS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    if (gameState !== 'playing') return;
    player.queuedDirection = direction;
  });
  document.querySelector('#restart').addEventListener('click', resetGame);
  document.querySelector('#play-again').addEventListener('click', resetGame);

  resetGame();
  animationFrame = window.requestAnimationFrame(gameLoop);
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(animationFrame), { once: true });
})();
