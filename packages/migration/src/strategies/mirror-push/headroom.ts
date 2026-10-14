import { statfsSync } from 'node:fs';
import type { DiskSpaceCheckResult } from './types.js';

export function checkScratchDiskSpace(
  dir: string,
  estimatedSizeBytes: number,
  headroomMultiplier = 1.5,
): DiskSpaceCheckResult {
  const requiredBytes = Math.ceil(estimatedSizeBytes * headroomMultiplier);
  try {
    const stats = statfsSync(dir);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      freeBytes,
      requiredBytes,
      sufficient: freeBytes >= requiredBytes,
      path: dir,
    };
  } catch {
    return {
      freeBytes: 0,
      requiredBytes,
      sufficient: true,
      path: dir,
    };
  }
}

export function assertScratchDiskSpace(
  dir: string,
  estimatedSizeBytes: number,
  headroomMultiplier = 1.5,
): DiskSpaceCheckResult {
  const result = checkScratchDiskSpace(
    dir,
    estimatedSizeBytes,
    headroomMultiplier,
  );
  if (!result.sufficient) {
    const freeGiB = (result.freeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const reqGiB = (result.requiredBytes / (1024 * 1024 * 1024)).toFixed(2);
    throw new Error(
      `Insufficient scratch disk space in "${result.path}". Available: ${freeGiB} GiB, Required with ${headroomMultiplier}x headroom: ${reqGiB} GiB.`,
    );
  }
  return result;
}
