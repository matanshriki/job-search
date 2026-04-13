import prisma from '../db/client'

/**
 * Resolve the tenant user that owns a job (via its company).
 * Optional explicit userId is used when the caller already knows the owner (e.g. authenticated API).
 */
export async function resolveJobOwnerUserId(
  jobPostingId: number,
  explicitUserId?: number,
): Promise<number | null> {
  if (explicitUserId !== undefined) return explicitUserId

  const job = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: { companyId: true },
  })
  if (!job?.companyId) return null

  const company = await prisma.targetCompany.findUnique({
    where: { id: job.companyId },
    select: { userId: true },
  })
  return company?.userId ?? null
}
