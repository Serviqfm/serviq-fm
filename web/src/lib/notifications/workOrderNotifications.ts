import { NotificationService } from '../NotificationService';

export async function notifyWOCreatedUpdated(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await NotificationService.notify(userId, 'wo_i_created_updated', {
    email: userEmail,
    subject: `Work Order ${woNumber} — Updated`,
    htmlContent: `
      <h2>Work Order Updated</h2>
      <p>Your work order <strong>${woNumber}</strong> has been updated.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${link}">View Work Order</a></p>
    `,
    pushTitle: `WO ${woNumber} Updated`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
    localized: {
      ar: {
        subject: `أمر العمل ${woNumber} — تم التحديث`,
        htmlContent: `
      <h2>تم تحديث أمر العمل</h2>
      <p>تم تحديث أمر العمل الخاص بك <strong>${woNumber}</strong>.</p>
      <p><strong>العنوان:</strong> ${woTitle}</p>
      <p><a href="${link}">عرض أمر العمل</a></p>
    `,
        pushTitle: `تحديث أمر العمل ${woNumber}`,
        pushBody: woTitle,
      },
    },
  });
}

export async function notifyWOAssigned(
  userId: string,
  userEmail: string,
  assignedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await NotificationService.notify(userId, 'wo_i_assigned_updated', {
    email: userEmail,
    subject: `You've been assigned to ${woNumber}`,
    htmlContent: `
      <h2>New Work Order Assignment</h2>
      <p><strong>${assignedBy}</strong> assigned you to work order <strong>${woNumber}</strong>.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${link}">View Work Order</a></p>
    `,
    pushTitle: `Assigned to ${woNumber}`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
    localized: {
      ar: {
        subject: `تم تعيينك على ${woNumber}`,
        htmlContent: `
      <h2>تعيين أمر عمل جديد</h2>
      <p>قام <strong>${assignedBy}</strong> بتعيينك على أمر العمل <strong>${woNumber}</strong>.</p>
      <p><strong>العنوان:</strong> ${woTitle}</p>
      <p><a href="${link}">عرض أمر العمل</a></p>
    `,
        pushTitle: `تم تعيينك على ${woNumber}`,
        pushBody: woTitle,
      },
    },
  });
}

export async function notifyWOAdditionalWorker(
  userId: string,
  userEmail: string,
  addedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await NotificationService.notify(userId, 'wo_i_additional_worker', {
    email: userEmail,
    subject: `Added to Work Order ${woNumber}`,
    htmlContent: `
      <h2>Added as Additional Worker</h2>
      <p><strong>${addedBy}</strong> added you as an additional worker to <strong>${woNumber}</strong>.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${link}">View Work Order</a></p>
    `,
    pushTitle: `Added to ${woNumber}`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
    localized: {
      ar: {
        subject: `تمت إضافتك إلى أمر العمل ${woNumber}`,
        htmlContent: `
      <h2>تمت إضافتك كعامل إضافي</h2>
      <p>قام <strong>${addedBy}</strong> بإضافتك كعامل إضافي إلى <strong>${woNumber}</strong>.</p>
      <p><strong>العنوان:</strong> ${woTitle}</p>
      <p><a href="${link}">عرض أمر العمل</a></p>
    `,
        pushTitle: `تمت إضافتك إلى ${woNumber}`,
        pushBody: woTitle,
      },
    },
  });
}

export async function notifyWOTeamAssigned(
  userIds: string[],
  emails: string[],
  teamName: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await Promise.all(
    userIds.map((userId, idx) =>
      NotificationService.notify(userId, 'wo_my_team_assigned', {
        email: emails[idx],
        subject: `Team Assignment: Work Order ${woNumber}`,
        htmlContent: `
          <h2>Team Work Order Assignment</h2>
          <p>Your team <strong>${teamName}</strong> has been assigned to work order <strong>${woNumber}</strong>.</p>
          <p><strong>Title:</strong> ${woTitle}</p>
          <p><a href="${link}">View Work Order</a></p>
        `,
        pushTitle: `Team: ${woNumber}`,
        pushBody: woTitle,
        pushData: { woId, woNumber, team: teamName },
        localized: {
          ar: {
            subject: `تعيين الفريق: أمر العمل ${woNumber}`,
            htmlContent: `
          <h2>تعيين أمر عمل للفريق</h2>
          <p>تم تعيين فريقك <strong>${teamName}</strong> على أمر العمل <strong>${woNumber}</strong>.</p>
          <p><strong>العنوان:</strong> ${woTitle}</p>
          <p><a href="${link}">عرض أمر العمل</a></p>
        `,
            pushTitle: `الفريق: ${woNumber}`,
            pushBody: woTitle,
          },
        },
      })
    )
  );
}

export async function notifyWOFollowedUpdated(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await NotificationService.notify(userId, 'wo_i_followed_updated', {
    email: userEmail,
    subject: `Followed Work Order ${woNumber} — Updated`,
    htmlContent: `
      <h2>Followed Work Order Updated</h2>
      <p>A work order you're following <strong>${woNumber}</strong> has been updated.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${link}">View Work Order</a></p>
    `,
    pushTitle: `${woNumber} Updated`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
    localized: {
      ar: {
        subject: `أمر العمل المتابَع ${woNumber} — تم التحديث`,
        htmlContent: `
      <h2>تم تحديث أمر عمل متابَع</h2>
      <p>تم تحديث أمر عمل تتابعه <strong>${woNumber}</strong>.</p>
      <p><strong>العنوان:</strong> ${woTitle}</p>
      <p><a href="${link}">عرض أمر العمل</a></p>
    `,
        pushTitle: `${woNumber} تم التحديث`,
        pushBody: woTitle,
      },
    },
  });
}

export async function notifyUnassignedWO(
  userIds: string[],
  emails: string[],
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await Promise.all(
    userIds.map((userId, idx) =>
      NotificationService.notify(userId, 'wo_unassigned_updated', {
        email: emails[idx],
        subject: `Unassigned Work Order: ${woNumber}`,
        htmlContent: `
          <h2>Unassigned Work Order</h2>
          <p>An unassigned work order <strong>${woNumber}</strong> requires attention.</p>
          <p><strong>Title:</strong> ${woTitle}</p>
          <p><a href="${link}">Assign Work Order</a></p>
        `,
        pushTitle: `Unassigned: ${woNumber}`,
        pushBody: woTitle,
        pushData: { woId, woNumber },
        localized: {
          ar: {
            subject: `أمر عمل غير معيَّن: ${woNumber}`,
            htmlContent: `
          <h2>أمر عمل غير معيَّن</h2>
          <p>أمر عمل غير معيَّن <strong>${woNumber}</strong> يتطلب انتباهك.</p>
          <p><strong>العنوان:</strong> ${woTitle}</p>
          <p><a href="${link}">تعيين أمر العمل</a></p>
        `,
            pushTitle: `غير معيَّن: ${woNumber}`,
            pushBody: woTitle,
          },
        },
      })
    )
  );
}

export async function notifyWOMention(
  userId: string,
  userEmail: string,
  mentionedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string,
  comment: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  await NotificationService.notify(userId, 'wo_i_mentioned', {
    email: userEmail,
    subject: `You've been mentioned in ${woNumber}`,
    htmlContent: `
      <h2>You've Been Mentioned</h2>
      <p><strong>${mentionedBy}</strong> mentioned you in work order <strong>${woNumber}</strong>.</p>
      <p><strong>Comment:</strong> ${comment}</p>
      <p><a href="${link}">View Conversation</a></p>
    `,
    pushTitle: `Mentioned in ${woNumber}`,
    pushBody: comment.substring(0, 100),
    pushData: { woId, woNumber },
    localized: {
      ar: {
        subject: `تمت الإشارة إليك في ${woNumber}`,
        htmlContent: `
      <h2>تمت الإشارة إليك</h2>
      <p>أشار إليك <strong>${mentionedBy}</strong> في أمر العمل <strong>${woNumber}</strong>.</p>
      <p><strong>التعليق:</strong> ${comment}</p>
      <p><a href="${link}">عرض المحادثة</a></p>
    `,
        pushTitle: `أشير إليك في ${woNumber}`,
        pushBody: comment.substring(0, 100),
      },
    },
  });
}

export async function notifyWOOverdue(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string,
  daysOverdue: number,
  managerEmail?: string
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${woId}`;
  const subject = `URGENT: Work Order ${woNumber} is ${daysOverdue} days overdue`;
  const htmlContent = `
    <h2 style="color: #C62828;">Overdue Work Order</h2>
    <p>Work order <strong>${woNumber}</strong> is <strong>${daysOverdue} days overdue</strong>.</p>
    <p><strong>Title:</strong> ${woTitle}</p>
    <p style="color: #C62828;"><strong>Immediate action required.</strong></p>
    <p><a href="${link}">Update Work Order</a></p>
  `;
  const htmlContentAr = `
    <h2 style="color: #C62828;">أمر عمل متأخر</h2>
    <p>أمر العمل <strong>${woNumber}</strong> متأخر بمقدار <strong>${daysOverdue} يوم</strong>.</p>
    <p><strong>العنوان:</strong> ${woTitle}</p>
    <p style="color: #C62828;"><strong>مطلوب اتخاذ إجراء فوري.</strong></p>
    <p><a href="${link}">تحديث أمر العمل</a></p>
  `;

  await NotificationService.notify(userId, 'wo_i_assigned_updated', {
    email: userEmail,
    subject,
    htmlContent,
    pushTitle: `⚠️ ${woNumber} Overdue`,
    pushBody: `${daysOverdue} days overdue`,
    pushData: { woId, woNumber, overdue: String(daysOverdue) },
    localized: {
      ar: {
        subject: `عاجل: أمر العمل ${woNumber} متأخر ${daysOverdue} يوم`,
        htmlContent: htmlContentAr,
        pushTitle: `⚠️ ${woNumber} متأخر`,
        pushBody: `متأخر ${daysOverdue} يوم`,
      },
    },
  });

  if (managerEmail) {
    await NotificationService.notify(userId, 'wo_i_assigned_updated', {
      email: managerEmail,
      subject: `Manager Alert: ${woNumber} is ${daysOverdue} days overdue`,
      htmlContent,
      pushTitle: `⚠️ Team: ${woNumber}`,
      pushBody: `${daysOverdue} days overdue`,
      pushData: { woId, woNumber, overdue: String(daysOverdue) },
      // No `localized`: getRecipientLanguage resolves the WORKER's language (userId),
      // but this alert goes to managerEmail — a localized block would give the manager
      // the worker's language. Keep the manager alert on the English default.
    });
  }
}

export async function notifyWelcomeEmail(
  userId: string,
  email: string,
  userName: string,
  loginUrl: string,
  tempPassword: string
): Promise<void> {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ServIQ-FM, ${userName}!</h2>
      <p>Your account has been created. You can now log in to the platform.</p>
      <h3>Login Details</h3>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 2px 4px;">${tempPassword}</code></p>
      <p style="color: #C62828;"><strong>Important:</strong> Please change your password immediately after your first login for security.</p>
      <p>If you have any questions, please contact your administrator.</p>
    </div>
  `;

  await NotificationService.notify(userId, 'wo_requested_from_portal', {
    email,
    subject: 'Welcome to ServIQ-FM',
    htmlContent,
    pushTitle: 'Welcome to ServIQ-FM',
    pushBody: 'Your account has been created. Please log in.',
  });
}
