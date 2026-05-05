import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

function emailTemplate(title: string, bodyHtml: string, trackingUrl?: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#0F2044;padding:24px 32px">
      <span style="font-size:20px;font-weight:800;color:#fff">Serviq<span style="color:#6DCFB0">FM</span></span>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F2044">${title}</h2>
      ${bodyHtml}
      ${trackingUrl ? `
      <div style="margin-top:28px;text-align:center">
        <a href="${trackingUrl}" style="display:inline-block;background:#0F2044;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">Track Your Request &rarr;</a>
      </div>` : ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center">
      ServIQ-FM &middot; Facility Management Platform
    </div>
  </div>
</body>
</html>`
}

export async function sendRequestConfirmation(opts: {
  to: string; name: string; siteName: string; title: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Request received — ${opts.siteName}`,
    html: emailTemplate(
      'Request Received',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">We've received your maintenance request <strong>"${opts.title}"</strong> at <strong>${opts.siteName}</strong>. Our team will review it shortly.</p>`,
      opts.trackingUrl
    ),
  })
}

export async function sendRequestApproved(opts: {
  to: string; name: string; siteName: string; woNumber: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Your request has been approved — ${opts.woNumber}`,
    html: emailTemplate(
      'Request Approved',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">Your request at <strong>${opts.siteName}</strong> has been approved and work order <strong>${opts.woNumber}</strong> has been created. A technician will be assigned shortly.</p>`,
      opts.trackingUrl
    ),
  })
}

export async function sendRequestRejected(opts: {
  to: string; name: string; siteName: string; reason?: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Update on your request — ${opts.siteName}`,
    html: emailTemplate(
      'Request Update',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">We've reviewed your maintenance request at <strong>${opts.siteName}</strong>. Unfortunately, we're unable to proceed at this time.</p>
       ${opts.reason ? `<p style="color:#334155;line-height:1.6"><strong>Reason:</strong> ${opts.reason}</p>` : ''}`,
      opts.trackingUrl
    ),
  })
}

export async function sendWOStatusUpdate(opts: {
  to: string; name: string; siteName: string; status: 'in_progress' | 'completed' | 'finished'; trackingUrl: string
}) {
  const subjects: Record<string, string> = {
    in_progress: 'Work has started on your request',
    completed: 'Your request has been completed',
    finished: `Request closed — ${opts.siteName}`,
  }
  const bodies: Record<string, string> = {
    in_progress: `A technician has started working on your maintenance request at <strong>${opts.siteName}</strong>.`,
    completed: `The work on your maintenance request at <strong>${opts.siteName}</strong> has been completed.`,
    finished: `Your maintenance request at <strong>${opts.siteName}</strong> has been officially closed.`,
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: subjects[opts.status],
    html: emailTemplate(
      subjects[opts.status],
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">${bodies[opts.status]}</p>`,
      opts.trackingUrl
    ),
  })
}
