// /api/admin/ghost-login.js
// Admin-only endpoint to get member data for ghost login/preview
// Allows admins to view dashboard as a specific user

const { checkAdminAccess } = require("../_auth");
const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Check admin access
    const { isAdmin, member: adminMember, error: authError } = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: "Admin access required",
        details: authError || "Not authorized"
      });
    }

    const { memberId, email } = req.query;
    
    // Require either memberId or email
    if (!memberId && !email) {
      return res.status(400).json({ 
        error: "Either memberId or email query parameter is required",
        example: "?memberId=mem_xxxxx OR ?email=user@example.com"
      });
    }

    // Initialize Memberstack
    if (!process.env.MEMBERSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "MEMBERSTACK_SECRET_KEY not configured" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get member data from Memberstack
    let memberData;
    let actualMemberId = memberId;
    
    try {
      // If email provided but no memberId, search by email first
      if (email && !memberId) {
        console.log("[ghost-login] Searching member by email:", email);
        
        // First try Supabase cache (faster and more reliable)
        const { data: cachedMember, error: cacheError } = await supabase
          .from('ms_members_cache')
          .select('member_id, email')
          .ilike('email', email) // Case-insensitive search
          .limit(1)
          .maybeSingle();
        
        if (cachedMember && cachedMember.member_id) {
          actualMemberId = cachedMember.member_id;
          console.log("[ghost-login] Found member ID from Supabase cache:", actualMemberId, "for email:", email);
        } else {
          // Fallback: Search Memberstack directly (slower but more comprehensive)
          console.log("[ghost-login] Email not in cache, searching Memberstack...");
          const { data: membersList } = await memberstack.members.list({ limit: 1000 });
          
          if (membersList && Array.isArray(membersList)) {
            const foundMember = membersList.find(m => {
              const memberEmail = m.auth?.email || m.email || '';
              return memberEmail.toLowerCase() === email.toLowerCase();
            });
            
            if (foundMember && foundMember.id) {
              actualMemberId = foundMember.id;
              console.log("[ghost-login] Found member ID from Memberstack:", actualMemberId, "for email:", email);
            } else {
              return res.status(404).json({ 
                error: "Member not found",
                details: `No member found with email: ${email}`
              });
            }
          } else {
            return res.status(404).json({ 
              error: "Member not found",
              details: `Could not search for email: ${email}`
            });
          }
        }
      }
      
      // Retrieve member by ID
      const { data } = await memberstack.members.retrieve({ id: actualMemberId });
      if (!data || !data.id) {
        return res.status(404).json({ 
          error: "Member not found",
          details: memberId ? `Member ID: ${memberId}` : `Email: ${email}`
        });
      }
      memberData = data;
      actualMemberId = data.id; // Use the actual ID from the retrieved member
      
    } catch (error) {
      console.error("[ghost-login] Error retrieving member:", error);
      return res.status(404).json({ 
        error: "Member not found", 
        details: error.message,
        searchedBy: memberId ? `memberId: ${memberId}` : `email: ${email}`
      });
    }

    // Get member JSON data (modules, bookmarks, etc.)
    let memberJson = null;
    try {
      const jsonData = memberData.json || memberData.data?.json || {};
      memberJson = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    } catch (e) {
      console.warn("[ghost-login] Could not parse member JSON:", e);
    }

    // Get cached data from Supabase
    const { data: cachedData } = await supabase
      .from('ms_members_cache')
      .select('*')
      .eq('member_id', actualMemberId)
      .single();

    return res.status(200).json({
      member: memberData,
      memberJson: memberJson,
      cachedData: cachedData || null,
      ghostMode: true,
      adminEmail: adminMember?.email || adminMember?.auth?.email || 'unknown',
      searchedBy: memberId ? 'memberId' : 'email',
      searchedValue: memberId || email
    });

  } catch (error) {
    console.error("[ghost-login] Error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
};
