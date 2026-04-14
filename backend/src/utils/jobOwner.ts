import prisma from '../db/client'

/**
 * Resolve the tenant user that owns a job. Prefer JobPosting.userId; optional explicit
 * userId is used when the caller already knows the owner (e.g. authenticated API).
 */
export async function resolveJobOwnerUserId(
  jobPostingId: number,
  explicitUserId?: number,
): Promise<number | null> {
  if (explicitUserId !== undefined) return explicitUserId

  const job = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: { userId: true },
  })
  return job?.userId ?? null
}
