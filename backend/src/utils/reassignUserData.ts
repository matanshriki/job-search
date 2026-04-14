#!/usr/bin/env tsx
/**
 * One-off: move all tenant-scoped rows from one user id to another, and optionally
 * move the Google OAuth identity to the target user so the next login lands on the right account.
 *
 *   cd backend && npx tsx src/utils/reassignUserData.ts --from 4 --to 1
 *   npx tsx src/utils/reassignUserData.ts --from 4 --to 1 --execute
 *
 * Without --execute, only prints what would change.
 */

import prisma from '../db/client'

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const fromIdx = args.indexOf('--from')
  const toIdx = args.indexOf('--to')
  if (fromIdx === -1 || toIdx === -1) {
    console.error('Usage: reassignUserData.ts --from <sourceUserId> --to <targetUserId> [--execute]')
    process.exit(1)
  }
  const from = parseInt(args[fromIdx + 1], 10)
  const to = parseInt(args[toIdx + 1], 10)
  if (!from || !to || from === to) {
    console.error('Invalid --from / --to')
    process.exit(1)
  }

  const [src, dst] = await Promise.all([
    prisma.user.findUnique({ where: { id: from } }),
    prisma.user.findUnique({ where: { id: to } }),
  ])
  if (!src || !dst) {
    console.error('Source or target user does not exist.')
    process.exit(1)
  }

  if (src.googleId && dst.googleId && src.googleId !== dst.googleId) {
    console.error(
      'Both users have different Google accounts linked. Unlink one in the DB manually, then re-run.',
    )
    process.exit(1)
  }

  const counts = await Promise.all([
    prisma.targetCompany.count({ where: { userId: from } }),
    prisma.jobPosting.count({ where: { userId: from } }),
    prisma.profile.count({ where: { userId: from } }),
    prisma.resume.count({ where: { userId: from } }),
    prisma.jobBoardSource.count({ where: { userId: from } }),
    prisma.approvalQueueItem.count({ where: { userId: from } }),
    prisma.notification.count({ where: { userId: from } }),
  ])

  console.log(`Reassign tenant data: user ${from} (${src.email}) → user ${to} (${dst.email})`)
  console.log({
    companies: counts[0],
    jobs: counts[1],
    profiles: counts[2],
    resumes: counts[3],
    jobBoardSources: counts[4],
    approvalQueue: counts[5],
    notifications: counts[6],
  })

  const willMoveGoogle = !!(src.googleId && !dst.googleId)
  if (willMoveGoogle) {
    console.log('\nAfter data move: Google login will be attached to target user (and source row removed).')
  } else if (src.googleId && dst.googleId === src.googleId) {
    console.log('\nGoogle id already on target; will only move data and delete duplicate source user if empty.')
  }

  if (!execute) {
    console.log('\nDry run only. Pass --execute to apply.')
    await prisma.$disconnect()
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.jobPosting.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.targetCompany.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.profile.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.resume.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.jobBoardSource.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.approvalQueueItem.updateMany({ where: { userId: from }, data: { userId: to } })
    await tx.notification.updateMany({ where: { userId: from }, data: { userId: to } })

    const fromSettings = await tx.appSettings.findUnique({ where: { userId: from } })
    if (fromSettings) {
      const toSettings = await tx.appSettings.findUnique({ where: { userId: to } })
      if (!toSettings) {
        await tx.appSettings.update({ where: { userId: from }, data: { userId: to } })
      } else {
        await tx.appSettings.delete({ where: { userId: from } })
      }
    }

    const googleIdToMove = src.googleId
    if (googleIdToMove && !dst.googleId) {
      await tx.user.update({ where: { id: from }, data: { googleId: null } })
      await tx.user.update({
        where: { id: to },
        data: {
          googleId: googleIdToMove,
          email: src.email.trim().toLowerCase(),
          name: src.name,
          avatarUrl: src.avatarUrl,
        },
      })
    }

    await tx.user.delete({ where: { id: from } })
  })

  console.log('\nDone. Have everyone log out and sign in with Google again.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
