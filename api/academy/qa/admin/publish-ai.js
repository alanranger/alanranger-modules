// /api/academy/qa/admin/publish-ai.js
// Publishes an AI draft answer (copies ai_answer → answer, sets answered fields)

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

    const { question_id, notify_member } = req.body;

    if (!question_id) {
      return res.status(400).json({ error: 'question_id is required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get question to check for AI answer
    const { data: question, error: fetchError } = await supabase
      .from('academy_qa_questions')
      .select('*')
      .eq('id', question_id)
      .single();

    if (fetchError || !question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (!question.ai_answer) {
      return res.status(400).json({ error: 'No AI answer draft available to publish' });
    }

    /**
     * AI DRAFT VISIBILITY POLICY - Publishing:
     * 
     * When AI draft is published:
     * - Copies ai_answer → answer field (published answer)
     * - Sets status to 'answered'
     * - Member now sees published answer only (ai_answer field is hidden)
     * - Status badge changes from "AI Suggested" → "Answered by AI Chat"
     * 
     * Rule: Once answer field is populated, member only sees answer (not ai_answer)
     */
    
    // Publish AI answer (copy draft to published answer field)
    const answeredTimestamp = question.ai_answered_at || new Date().toISOString();
    const updates = {
      answer: question.ai_answer, // Copy AI draft to published answer field
      admin_answer: question.ai_answer, // Keep for backward compatibility
      answered_at: answeredTimestamp,
      admin_answered_at: answeredTimestamp,
      answered_by: 'Robo-Ranger',
      answer_source: 'ai',
      status: 'answered', // Status changes to answered - member sees published answer
      updated_at: new Date().toISOString()
      // Note: ai_answer field remains (for history), but member sees answer field only
    };

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

    // Track event: question_published (AI answer published)
    try {
      await supabase.from("academy_events").insert([{
        event_type: "question_published",
        member_id: question.member_id,
        email: question.member_email || null,
        path: question.page_url,
        title: `Q&A: ${question.question.length > 80 ? question.question.substring(0, 80) + "..." : question.question}`,
        category: "qa",
        meta: { 
          question_id: question_id,
          answer_source: "ai"
        },
        created_at: new Date().toISOString()
      }]);
    } catch (eventError) {
      console.error('[qa-admin-publish-ai] Event tracking error (non-fatal):', eventError);
    }

    // Send notification if requested
    if (notify_member && question.member_email) {
      try {
        await sendAnswerNotification({
          memberEmail: question.member_email,
          memberName: question.member_name,
          question: question.question,
          answer: question.ai_answer,
          questionId: question_id
        });
      } catch (notifyError) {
        console.error('[qa-admin-publish-ai] Notification failed:', notifyError);
      }
    }

    return res.status(200).json({ question: data });
  } catch (error) {
    console.error('[qa-admin-publish-ai] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper: Send email notification (same as answer.js)
async function sendAnswerNotification({ memberEmail, memberName, question, answer, questionId }) {
  const emailProvider = process.env.EMAIL_PROVIDER || 'resend';
  const emailApiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
  
  if (!emailApiKey) {
    console.warn('[qa-admin-publish-ai] No email API key configured, skipping notification');
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

  try {
    if (emailProvider === 'resend') {
      try {
        const resend = require('resend');
        const resendClient = new resend.Resend(emailApiKey);
        await resendClient.emails.send(emailContent);
        console.log('[qa-admin-publish-ai] Email sent via Resend');
      } catch (e) {
        console.warn('[qa-admin-publish-ai] Resend package not installed, skipping email:', e.message);
      }
    } else if (emailProvider === 'sendgrid') {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(emailApiKey);
        await sgMail.send(emailContent);
        console.log('[qa-admin-publish-ai] Email sent via SendGrid');
      } catch (e) {
        console.warn('[qa-admin-publish-ai] SendGrid package not installed, skipping email:', e.message);
      }
    }
  } catch (emailError) {
    console.error('[qa-admin-publish-ai] Email sending failed:', emailError);
  }
}
