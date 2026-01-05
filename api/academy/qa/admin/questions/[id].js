// /api/academy/qa/admin/questions/[id].js
// Updates a Q&A question (save/edit answer)

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    if (req.method !== 'PATCH') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    const { answer, answer_source, answered_by } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Build update object
    const updates = {
      updated_at: new Date().toISOString()
    };

    // If answer is provided, update answer fields
    if (answer !== undefined) {
      if (answer === null || answer.trim() === '') {
        // Clearing answer
        updates.admin_answer = null;
        updates.admin_answered_at = null;
        updates.answered_by = null;
        updates.status = 'queued'; // Reset to queued if answer cleared
      } else {
        // Setting answer
        updates.admin_answer = answer.trim();
        updates.admin_answered_at = new Date().toISOString();
        updates.answered_by = answered_by || 'admin';
        updates.status = 'answered';
      }
    }

    if (answer_source) {
      updates.answer_source = answer_source;
    }

    // Update the question
    const { data, error } = await supabase
      .from('academy_qa_questions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Question not found' });
    }

    return res.status(200).json({ question: data });
  } catch (error) {
    console.error('[qa-admin-questions-id] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
