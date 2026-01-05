// /api/academy/qa/admin/answer.js
// Saves a manual answer and optionally publishes it
// Writes answer, answered_at, answered_by, answer_source='manual', status='answered'

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const { checkAdminAccess } = require(path.resolve(__dirname, "../../../admin/_auth.js"));

module.exports = async (req, res) => {
  // Check admin access
  const { isAdmin, error } = await checkAdminAccess(req);
  if (!isAdmin) {
    return res.status(403).json({ error: error || "Admin access required" });
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { question_id, answer, answered_by, notify_member } = req.body;

    if (!question_id) {
      return res.status(400).json({ error: 'question_id is required' });
    }

    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'answer is required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get question first to check member_email for notifications
    const { data: question, error: fetchError } = await supabase
      .from('academy_qa_questions')
      .select('*')
      .eq('id', question_id)
      .single();

    if (fetchError || !question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Update question with answer
    const updates = {
      answer: answer.trim(),
      admin_answer: answer.trim(), // Keep for backward compatibility
      answered_at: new Date().toISOString(),
      admin_answered_at: new Date().toISOString(),
      answered_by: answered_by || 'Alan',
      answer_source: 'manual',
      status: 'answered',
      updated_at: new Date().toISOString()
    };

    // If notify_member is true, we'll handle notification separately
    if (notify_member) {
      updates.member_notified_at = new Date().toISOString();
    }

    const { data, error: updateError } = await supabase
      .from('academy_qa_questions')
      .update(updates)
      .eq('id', question_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Send notification if requested
    if (notify_member && question.member_email) {
      try {
        await sendAnswerNotification({
          memberEmail: question.member_email,
          memberName: question.member_name,
          question: question.question,
          answer: answer.trim(),
          questionId: question_id
        });
      } catch (notifyError) {
        console.error('[qa-admin-answer] Notification failed:', notifyError);
        // Don't fail the request if notification fails
      }
    }

    return res.status(200).json({ question: data });
  } catch (error) {
    console.error('[qa-admin-answer] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper: Send email notification to member
async function sendAnswerNotification({ memberEmail, memberName, question, answer, questionId }) {
  // Use Resend or SendGrid - check env for provider
  const emailProvider = process.env.EMAIL_PROVIDER || 'resend';
  const emailApiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
  
  if (!emailApiKey) {
    console.warn('[qa-admin-answer] No email API key configured, skipping notification');
    return;
  }

  const qaPageUrl = `https://www.alanranger.com/academy/photography-questions-answers`;
  const firstName = memberName ? memberName.split(' ')[0] : 'there';

  const emailContent = {
    to: memberEmail,
    from: process.env.EMAIL_FROM || 'noreply@alanranger.com',
    subject: 'Your Academy question has been answered',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #E57200;">Your Academy Question Has Been Answered</h2>
        <p>Hi ${firstName},</p>
        <p>Great news! Your question has been answered:</p>
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="font-weight: 600; margin-bottom: 10px;">Your Question:</p>
          <p>${question}</p>
        </div>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 3px solid #10b981;">
          <p style="font-weight: 600; margin-bottom: 10px;">Answer:</p>
          <p>${answer.replace(/\n/g, '<br>')}</p>
        </div>
        <p style="margin-top: 30px;">
          <a href="${qaPageUrl}" style="background: #E57200; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Your Questions
          </a>
        </p>
      </div>
    `
  };

  if (emailProvider === 'resend') {
    const resend = require('resend');
    const resendClient = new resend.Resend(emailApiKey);
    await resendClient.emails.send(emailContent);
  } else if (emailProvider === 'sendgrid') {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(emailApiKey);
    await sgMail.send(emailContent);
  }
}
