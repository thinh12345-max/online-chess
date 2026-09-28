/**
 * Two-Client Chess Workflow Verification
 * Run with: npx tsx e2e-verify.ts
 */

import { chromium, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function getBoardDimensions(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const board = document.querySelector('[class*="grid-cols-8"]');
    if (!board) return { width: 0, height: 0 };
    const rect = board.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
}

async function countSquares(page: Page): Promise<number> {
  return page.evaluate(() => {
    const board = document.querySelector('[class*="grid-cols-8"]');
    if (!board) return 0;
    return board.querySelectorAll(':scope > div').length;
  });
}

async function countPieces(page: Page): Promise<number> {
  return page.evaluate(() => {
    const board = document.querySelector('[class*="grid-cols-8"]');
    if (!board) return 0;
    return board.querySelectorAll(':scope > div svg').length;
  });
}

async function waitForBoardVisible(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('[class*="grid-cols-8"]', { timeout });
}

async function clickSquare(page: Page, file: string, rank: number): Promise<void> {
  const fileIndex = 'abcdefgh'.indexOf(file);
  const rowIndex = 8 - rank;
  const squareIndex = rowIndex * 8 + fileIndex;
  const board = page.locator('[class*="grid-cols-8"]').first();
  const squares = board.locator('> div');
  const square = squares.nth(squareIndex);
  await square.click();
}

async function waitForSquareHasPiece(page: Page, file: string, rank: number, timeout = 10000): Promise<boolean> {
  const fileIndex = 'abcdefgh'.indexOf(file);
  const rowIndex = 8 - rank;
  const squareIndex = rowIndex * 8 + fileIndex;
  try {
    await page.waitForFunction(
      (idx) => {
        const board = document.querySelector('[class*="grid-cols-8"]');
        if (!board) return false;
        const squares = board.querySelectorAll(':scope > div');
        return squares[idx]?.querySelector('svg') !== null;
      },
      squareIndex,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Two-Client Chess Workflow Verification ===\n');

  const browser = await chromium.launch({ headless: true });
  const results: Record<string, string> = {};

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const clientA = await contextA.newPage();
  const clientB = await contextB.newPage();

  let roomUrl = '';

  try {
    // ===== TEST 1: Client A creates room =====
    console.log('--- Test 1: Client A creates room ---');
    await clientA.goto(BASE_URL, { waitUntil: 'networkidle' });

    const playBtn = clientA.getByRole('button', { name: /play now/i }).first();
    await playBtn.click();

    await clientA.waitForURL(/\/chess\/room\//, { timeout: 10000 });
    roomUrl = clientA.url();
    console.log(`Room URL: ${roomUrl}`);

    // Wait for loading to complete
    await clientA.waitForFunction(() => {
      const text = document.body.innerText;
      return !text.includes('Loading game');
    }, { timeout: 15000 }).catch(() => {
      console.log('Note: Page still showing loading after 15 seconds');
    });

    await waitForBoardVisible(clientA);
    const boardVisibleA = await clientA.locator('[class*="grid-cols-8"]').count() > 0;
    const dimsA = await getBoardDimensions(clientA);
    const squaresA = await countSquares(clientA);
    const piecesA = await countPieces(clientA);

    console.log(`Board visible: ${boardVisibleA}`);
    console.log(`Board dimensions: ${dimsA.width} x ${dimsA.height}`);
    console.log(`Squares: ${squaresA}, Pieces: ${piecesA}`);

    results['Test 1'] = boardVisibleA && squaresA === 64 && piecesA === 32 ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 1']}\n`);

    // ===== TEST 2: Waiting state =====
    console.log('--- Test 2: Waiting state ---');
    const waitingText = await clientA.getByText(/waiting for opponent/i).count();
    const boardVisibleWhileWaiting = await clientA.locator('[class*="grid-cols-8"]').count() > 0;
    console.log(`Waiting text visible: ${waitingText > 0}`);
    console.log(`Board visible while waiting: ${boardVisibleWhileWaiting}`);
    results['Test 2'] = boardVisibleWhileWaiting ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 2']}\n`);

    // ===== TEST 3: Client B joins =====
    console.log('--- Test 3: Client B joins ---');
    await clientB.goto(roomUrl, { waitUntil: 'networkidle' });

    await clientA.waitForFunction(() => {
      const text = document.body.innerText;
      return !text.includes('Waiting for opponent') && !text.includes('waiting for');
    }, { timeout: 10000 }).catch(() => {
      console.log('Note: Client A still showing waiting state (may be offline mode)');
    });

    await waitForBoardVisible(clientB);
    const boardVisibleB = await clientB.locator('[class*="grid-cols-8"]').count() > 0;
    const squaresB = await countSquares(clientB);
    const piecesB = await countPieces(clientB);
    const dimsB = await getBoardDimensions(clientB);
    const piecesA2 = await countPieces(clientA);

    console.log(`Board visible: ${boardVisibleB}`);
    console.log(`Board dimensions: ${dimsB.width} x ${dimsB.height}`);
    console.log(`Squares: ${squaresB}, Pieces: ${piecesB}`);
    console.log(`Both clients have 32 pieces: ClientA=${piecesA2}, ClientB=${piecesB}`);

    results['Test 3'] = boardVisibleB && squaresB === 64 && piecesB === 32 ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 3']}\n`);

    // ===== TEST 4: White makes e2-e4 =====
    console.log('--- Test 4: White makes e2-e4 ---');

    // Wait until Client A shows it's their turn (not waiting)
    await clientA.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Your move') && !text.includes('Waiting for opponent');
    }, { timeout: 15000 }).catch(() => {
      console.log('Note: Client A did not transition to ready state');
    });

    await clickSquare(clientA, 'e', 2);
    await clientA.waitForTimeout(300);
    await clickSquare(clientA, 'e', 4);

    // Wait for the move to appear on the board (check e4 has piece)
    await clientA.waitForFunction(() => {
      const board = document.querySelector('[class*="grid-cols-8"]');
      if (!board) return false;
      const squares = board.querySelectorAll(':scope > div');
      const e4Index = (8 - 4) * 8 + 4;
      return squares[e4Index]?.querySelector('svg') !== null;
    }, { timeout: 10000 }).catch(() => {
      console.log('Note: e4 did not update on Client A');
    });

    // Wait for sync on Client B
    await clientB.waitForFunction(() => {
      const board = document.querySelector('[class*="grid-cols-8"]');
      if (!board) return false;
      const squares = board.querySelectorAll(':scope > div');
      const e4Index = (8 - 4) * 8 + 4;
      return squares[e4Index]?.querySelector('svg') !== null;
    }, { timeout: 10000 }).catch(() => {
      console.log('Note: e4 did not update on Client B');
    });

    const pieceOnE4A = await clientA.evaluate(() => {
      const board = document.querySelector('[class*="grid-cols-8"]');
      if (!board) return false;
      const squares = board.querySelectorAll(':scope > div');
      const e4Index = (8 - 4) * 8 + 4;
      return squares[e4Index]?.querySelector('svg') !== null;
    });

    const pieceOnE4B = await clientB.evaluate(() => {
      const board = document.querySelector('[class*="grid-cols-8"]');
      if (!board) return false;
      const squares = board.querySelectorAll(':scope > div');
      const e4Index = (8 - 4) * 8 + 4;
      return squares[e4Index]?.querySelector('svg') !== null;
    });

    console.log(`e4 has piece on Client A: ${pieceOnE4A}`);
    console.log(`e4 has piece on Client B: ${pieceOnE4B}`);
    results['Test 4'] = pieceOnE4A && pieceOnE4B ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 4']}\n`);

    // ===== TEST 5: Black makes e7-e5 =====
    console.log('--- Test 5: Black makes e7-e5 ---');

    await clickSquare(clientB, 'e', 7);
    await clientB.waitForTimeout(300);
    await clickSquare(clientB, 'e', 5);

    const e5A = await waitForSquareHasPiece(clientA, 'e', 5);
    const e5B = await waitForSquareHasPiece(clientB, 'e', 5);

    console.log(`e5 has piece on Client A: ${e5A}`);
    console.log(`e5 has piece on Client B: ${e5B}`);
    results['Test 5'] = e5A && e5B ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 5']}\n`);

    // ===== TEST 6: Refresh resilience =====
    console.log('--- Test 6: Refresh resilience ---');

    await clientA.reload({ waitUntil: 'networkidle' });
    await waitForBoardVisible(clientA);

    const e4AfterA = await waitForSquareHasPiece(clientA, 'e', 4);
    const e5AfterA = await waitForSquareHasPiece(clientA, 'e', 5);
    console.log(`e4+e5 on Client A after refresh: e4=${e4AfterA}, e5=${e5AfterA}`);

    await clientB.reload({ waitUntil: 'networkidle' });
    await waitForBoardVisible(clientB);

    const e4AfterB = await waitForSquareHasPiece(clientB, 'e', 4);
    const e5AfterB = await waitForSquareHasPiece(clientB, 'e', 5);
    console.log(`e4+e5 on Client B after refresh: e4=${e4AfterB}, e5=${e5AfterB}`);

    results['Test 6'] = e4AfterA && e5AfterA && e4AfterB && e5AfterB ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 6']}\n`);

    // ===== TEST 7: Board geometry =====
    console.log('--- Test 7: Board geometry ---');
    const dimsA2 = await getBoardDimensions(clientA);
    const dimsB2 = await getBoardDimensions(clientB);
    console.log(`Client A board: ${dimsA2.width} x ${dimsA2.height}`);
    console.log(`Client B board: ${dimsB2.width} x ${dimsB2.height}`);
    const geometryOk = dimsA2.width > 0 && dimsA2.height > 0 && dimsB2.width > 0 && dimsB2.height > 0
      && Math.abs(dimsA2.width - dimsA2.height) < 10
      && Math.abs(dimsB2.width - dimsB2.height) < 10;
    console.log(`Board is square (within 10px): ${geometryOk}`);
    results['Test 7'] = geometryOk ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 7']}\n`);

    // ===== TEST 8: Chess interaction =====
    console.log('--- Test 8: Chess interaction (legal moves) ---');

    // Try d2-d4 on white (after e4 e5, it's white's turn)
    await clickSquare(clientA, 'd', 2);
    await clientA.waitForTimeout(300);
    await clickSquare(clientA, 'd', 4);

    const d4A = await waitForSquareHasPiece(clientA, 'd', 4);
    const d4B = await waitForSquareHasPiece(clientB, 'd', 4);

    console.log(`Pawn moved to d4 on Client A: ${d4A}`);
    console.log(`Pawn moved to d4 on Client B: ${d4B}`);
    results['Test 8'] = d4A && d4B ? 'PASS' : 'FAIL';
    console.log(`Result: ${results['Test 8']}\n`);

  } catch (err) {
    console.error('Test error:', err);
    results['Error'] = `FAIL: ${err}`;
  } finally {
    await browser.close();
  }

  console.log('\n=== SUMMARY ===');
  for (const [test, result] of Object.entries(results)) {
    console.log(`${test}: ${result}`);
  }

  const allPassed = Object.values(results).every(r => r === 'PASS');
  console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
