// /api/academy/qa/admin/ai-suggest.js
// Generates AI answer draft using Robo-Ranger (Chat AI Bot)
// Stores in ai_answer, sets status='ai_suggested' (does not publish to member)

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

    const { question_id, question, page_url } = req.body;

    if (!question_id) {
      return res.status(400).json({ error: 'question_id is required' });
    }

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get Chat AI Bot API URL from env (default to known deployment)
    const chatBotApiUrl = process.env.CHAT_BOT_API_URL || "https://alan-chat-proxy.vercel.app/api/chat";
    
    // Call Robo-Ranger (Chat AI Bot) to generate answer
    let aiAnswer = null;
    let aiModel = null;
    
    try {
      const chatResponse = await fetch(chatBotApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: question,
          pageContext: page_url ? { pathname: page_url } : null
        }),
        timeout: 30000 // 30 second timeout
      });

      if (!chatResponse.ok) {
        throw new Error(`Chat API returned ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      
      if (chatData.ok && chatData.answer) {
        aiAnswer = chatData.answer;
        aiModel = chatData.model || 'robo-ranger-v1';
        
        // Extract and append related articles from structured data
        // Format: "Related guides:\n- [Article Title](url)\n- [Article Title](url)"
        if (chatData.structured && chatData.structured.articles && Array.isArray(chatData.structured.articles) && chatData.structured.articles.length > 0) {
          const articles = chatData.structured.articles.slice(0, 6); // Limit to 6 articles
          const relatedGuides = articles
            .map(article => {
              const title = article.title || article.page_url || 'Guide';
              const url = article.page_url || article.url || '';
              if (url) {
                return `- [${title}](${url})`;
              }
              return null;
            })
            .filter(Boolean) // Remove null entries
            .join('\n');
          
          if (relatedGuides) {
            // Append to answer text if not already present
            if (!aiAnswer.includes('Related guides:')) {
              aiAnswer += '\n\nRelated guides:\n' + relatedGuides;
            }
          }
        }
      } else {
        throw new Error(chatData.error || 'No answer from AI');
      }
    } catch (aiError) {
      console.error('[qa-admin-ai-suggest] AI generation failed:', aiError);
      // Don't fail the request - just log and continue without AI answer
      return res.status(500).json({ 
        error: 'AI answer generation failed', 
        details: aiError.message 
      });
    }

    /**
     * AI DRAFT VISIBILITY POLICY:
     * 
     * When AI draft is generated:
     * - Stores in ai_answer field (NOT answer field)
     * - Sets status to 'ai_suggested'
     * - Member can see AI draft: answer IS NULL AND ai_answer IS NOT NULL
     * - Status badge: "AI Suggested" (orange)
     * 
     * Once admin publishes (via /publish-ai):
     * - Copies ai_answer → answer field
     * - Sets status to 'answered'
     * - Member sees published answer only (ai_answer hidden)
     * - Status badge: "Answered by AI Chat" (blue)
     */
    
    // Update question with AI draft (draft only - not published to member yet)
    const updates = {
      ai_answer: aiAnswer, // Draft stored here - visible to member
      ai_answered_at: new Date().toISOString(),
      ai_model: aiModel,
      status: 'ai_suggested', // Status indicates AI draft exists
      updated_at: new Date().toISOString()
      // Note: answer field remains NULL - member sees ai_answer as draft
    };

    const { data, error: updateError } = await supabase
      .from('academy_qa_questions')
      .update(updates)
      .eq('id', question_id)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!data) {
      return res.status(404).json({ error: 'Question not found' });
    }

    return res.status(200).json({ 
      question: data,
      ai_answer: aiAnswer,
      ai_model: aiModel
    });
  } catch (error) {
    console.error('[qa-admin-ai-suggest] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
