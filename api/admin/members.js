// /api/admin/members.js
// Returns paginated member directory with filters
// Combines ms_members_cache with engagement stats from academy_events

const path = require('node:path');
const { createClient } = require("@supabase/supabase-js");
const { isAcademyInvoice } = require('../../lib/academyStripeConfig');

const TRIAL_PLAN_ID = "pln_academy-trial-30-days--wb7v0hbh";
const HISTORY_FILTER_KEYS = new Set([
  'all_members_all_time',
  'trial_conversions_30d',
  'trial_conversions_all_time',
  'trial_dropoff_30d',
  'trial_dropoff_all_time',
  'trials_ended_30d',
  'at_risk_trials_7d',
  'annual_all_time',
  'direct_annual_all_time',
  'annual_revenue_30d',
  'direct_annual_30d',
  'net_member_growth_30d',
  'net_paid_growth_30d',
  'annual_churn_90d',
  'at_risk_annual_30d',
  'trial_opportunity_all',
  'trial_opportunity_3pct'
]);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const getPlanStatus = (plan = {}) => (plan.status || '').toUpperCase();
const isTrialPlan = (plan = {}) => {
  return (
    plan.plan_type === 'trial' ||
    plan.plan_id === TRIAL_PLAN_ID ||
    (plan.payment_mode === 'ONETIME' && plan.expiry_date)
  );
};
const normalizeNumber = (value) => {
  if (value == null) return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isNaN(num) ? null : num;
};

const getStripeClient = () => {
  try {
    const stripePath = path.join(process.cwd(), 'lib', 'stripe');
    const getStripe = require(stripePath);
    return getStripe();
  } catch (error) {
    console.warn('[members] Stripe client unavailable:', error.message);
    return null;
  }
};

const normalizeEmailKey = (value) => {
  if (!value) return null;
  return String(value).toLowerCase().trim();
};

const collectStripeCustomerIds = (members) => {
  const map = new Map();
  (members || []).forEach(member => {
    const email = normalizeEmailKey(member?.email);
    if (!email) return;
    const plan = member?.plan_summary || {};
    const rawCustomer = plan.customer_id || plan.stripe_customer_id || plan.customer || plan.customerId || null;
    const customerId = typeof rawCustomer === 'string' ? rawCustomer : rawCustomer?.id;
    if (!customerId) return;
    if (!map.has(email)) map.set(email, new Set());
    map.get(email).add(customerId);
  });
  return map;
};

const addTotalsByEmail = ({ totalsByEmail, refundsByEmail, email, totalPaidMinor, refundMinor }) => {
  if (!email) return;
  totalsByEmail.set(email, (totalsByEmail.get(email) || 0) + totalPaidMinor / 100);
  refundsByEmail.set(email, (refundsByEmail.get(email) || 0) + refundMinor / 100);
};

const buildInvoiceListParams = (startingAfter) => {
  const params = {
    limit: 100,
    status: 'paid',
    expand: ['data.lines.data.price', 'data.lines.data.price.product', 'data.charge', 'data.customer']
  };
  if (startingAfter) params.starting_after = startingAfter;
  return params;
};

const fetchStripeInvoiceEmailTotals = async (members) => {
  const stripe = getStripeClient();
  if (!stripe) return { totalsByEmail: new Map(), refundsByEmail: new Map() };

  const emails = new Set((members || [])
    .map(member => normalizeEmailKey(member?.email))
    .filter(Boolean));

  if (emails.size === 0) return { totalsByEmail: new Map(), refundsByEmail: new Map() };

  const totalsByEmail = new Map();
  const refundsByEmail = new Map();

  const getInvoiceRefundMinor = async (invoice) => {
    if (invoice.amount_refunded) return invoice.amount_refunded;
    const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id;
    if (!chargeId) return 0;
    let total = 0;
    try {
      const refundsList = await stripe.refunds.list({ charge: chargeId, limit: 100 });
      (refundsList.data || []).forEach(refund => {
        total += refund.amount || 0;
      });
    } catch (error) {
      console.warn('[members] Stripe refund list failed:', error.message);
    }
    return total;
  };

  let startingAfter = null;
  let hasMore = true;
  while (hasMore) {
    const response = await stripe.invoices.list(buildInvoiceListParams(startingAfter));
    const invoices = response.data || [];
    for (const invoice of invoices) {
      if (!isAcademyInvoice(invoice)) continue;
      const email = normalizeEmailKey(invoice.customer_email || invoice.customer?.email);
      if (!email || !emails.has(email)) continue;
      const totalPaidMinor = invoice.amount_paid ?? invoice.total ?? 0;
      const refundMinor = await getInvoiceRefundMinor(invoice);
      addTotalsByEmail({ totalsByEmail, refundsByEmail, email, totalPaidMinor, refundMinor });
    }
    if (response.has_more && invoices.length > 0) {
      startingAfter = invoices[invoices.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return { totalsByEmail, refundsByEmail };
};

const fetchStripeTotalsByEmail = async (members) => {
  const stripe = getStripeClient();
  if (!stripe) return new Map();

  const emails = Array.from(new Set((members || [])
    .map(member => member?.email)
    .filter(Boolean)
    .map(email => String(email).toLowerCase())));

  if (emails.length === 0) return new Map();

  const customerIdsByEmail = collectStripeCustomerIds(members);
  const totals = new Map();

  for (const email of emails) {
    let sum = 0;
    try {
      const customers = await stripe.customers.list({ email, limit: 10 });
      const customerIds = new Set([
        ...(customerIdsByEmail.get(email) || []),
        ...((customers.data || []).map(customer => customer.id))
      ]);
      for (const customerId of customerIds) {
        const invoices = await stripe.invoices.list({
          customer: customerId,
          status: 'paid',
          limit: 100,
          expand: ['data.lines.data.price', 'data.lines.data.price.product']
        });
        (invoices.data || []).forEach(invoice => {
          if (isAcademyInvoice(invoice)) {
            sum += (invoice.amount_paid || 0) / 100;
          }
        });
      }
    } catch (error) {
      console.warn('[members] Stripe lookup failed for email:', email, error.message);
    }
    totals.set(email, sum);
  }

  return totals;
};

const fetchStripeRefundsByEmail = async (members) => {
  const stripe = getStripeClient();
  if (!stripe) return new Map();

  const emails = Array.from(new Set((members || [])
    .map(member => member?.email)
    .filter(Boolean)
    .map(email => String(email).toLowerCase())));

  if (emails.length === 0) return new Map();

  const refunds = new Map();
  const planTypeByEmail = new Map();
  const customerIdsByEmail = collectStripeCustomerIds(members);

  (members || []).forEach(member => {
    const email = member?.email ? String(member.email).toLowerCase() : null;
    if (!email || planTypeByEmail.has(email)) return;
    planTypeByEmail.set(email, member?.plan_summary?.plan_type || null);
  });

  const getInvoiceRefundTotal = async (invoice, skipAcademyCheck = false) => {
    if (!skipAcademyCheck && !isAcademyInvoice(invoice)) return 0;
    let total = (invoice.amount_refunded || 0) / 100;
    if (total > 0 || !invoice.charge) return total;

    const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id;
    if (!chargeId) return total;

    try {
      const refundsList = await stripe.refunds.list({ charge: chargeId, limit: 100 });
      (refundsList.data || []).forEach(refund => {
        total += (refund.amount || 0) / 100;
      });
    } catch (refundError) {
      console.warn('[members] Stripe refund charge lookup failed:', refundError.message);
    }

    return total;
  };

  for (const email of emails) {
    let academySum = 0;
    let fallbackSum = 0;
    try {
      const customers = await stripe.customers.list({ email, limit: 10 });
      const customerIds = new Set([
        ...(customerIdsByEmail.get(email) || []),
        ...((customers.data || []).map(customer => customer.id))
      ]);
      for (const customerId of customerIds) {
        const invoices = await stripe.invoices.list({
          customer: customerId,
          limit: 100,
          expand: ['data.lines.data.price', 'data.lines.data.price.product', 'data.charge']
        });
        for (const invoice of invoices.data || []) {
          academySum += await getInvoiceRefundTotal(invoice);
          fallbackSum += await getInvoiceRefundTotal(invoice, true);
        }
      }
    } catch (error) {
      console.warn('[members] Stripe refund lookup failed for email:', email, error.message);
    }
    const planType = planTypeByEmail.get(email);
    const useFallback = academySum === 0 && fallbackSum > 0 && planType === 'annual';
    refunds.set(email, useFallback ? fallbackSum : academySum);
  }

  return refunds;
};

const extractNameFromPayload = (payload) => {
  if (!payload) return null;
  const customerDetails = payload?.data?.object?.customer_details;
  if (customerDetails?.name) return customerDetails.name;
  if (payload?.data?.object?.customer_name) return payload.data.object.customer_name;
  if (payload?.data?.object?.billing_details?.name) return payload.data.object.billing_details.name;
  return null;
};

const buildPlanTimeline = (member) => {
  const plan = member.plan_summary || {};
  const isTrial = isTrialPlan(plan);
  const isAnnual = plan.plan_type === 'annual';
  const status = getPlanStatus(plan);

  let trialStartAt = null;
  let trialEndAt = null;
  if (isTrial) {
    trialStartAt = parseDate(plan.trial_start_at) || parseDate(member.created_at);
    trialEndAt = parseDate(plan.expiry_date) || (trialStartAt ? addDays(trialStartAt, 30) : null);
  }

  let annualStartAt = null;
  let annualEndAt = null;
  if (isAnnual) {
    annualStartAt = parseDate(plan.current_period_start) || parseDate(member.created_at);
    annualEndAt = parseDate(plan.current_period_end) || parseDate(plan.expiry_date) || (annualStartAt ? addDays(annualStartAt, 365) : null);
  }

  return {
    member_id: member.member_id,
    isTrial,
    isAnnual,
    status,
    trialStartAt,
    trialEndAt,
    annualStartAt,
    annualEndAt
  };
};

const filterByMemberIds = (members, ids) => members.filter(member => ids.has(member.member_id));

const buildMemberPlanMap = (members) => {
  const map = new Map();
  members.forEach(member => {
    map.set(member.member_id, buildPlanTimeline(member));
  });
  return map;
};

const buildTrialHistorySets = (trialHistoryRows, start30d, now) => {
  const trialHistoryMemberIds = new Set();
  const trialConversionsAllTimeIds = new Set();
  const trialConversions30dIds = new Set();
  const trialsEnded30dIds = new Set();
  const trialDropoff30dIds = new Set();
  const trialDropoffAllTimeIds = new Set();

  trialHistoryRows.forEach(row => {
    if (!row?.member_id) return;
    trialHistoryMemberIds.add(row.member_id);
    const convertedAt = parseDate(row.converted_at);
    const endAt = parseDate(row.trial_end_at);
    if (row.converted_at) {
      trialConversionsAllTimeIds.add(row.member_id);
    }
    if (convertedAt && convertedAt >= start30d) {
      trialConversions30dIds.add(row.member_id);
    }
    if (endAt && endAt >= start30d && endAt <= now) {
      trialsEnded30dIds.add(row.member_id);
      if (!row.converted_at) {
        trialDropoff30dIds.add(row.member_id);
      }
    }
    if (endAt && endAt <= now && !row.converted_at) {
      trialDropoffAllTimeIds.add(row.member_id);
    }
  });

  return {
    trialHistoryMemberIds,
    trialConversionsAllTimeIds,
    trialConversions30dIds,
    trialsEnded30dIds,
    trialDropoff30dIds,
    trialDropoffAllTimeIds
  };
};

const buildAnnualHistorySets = (annualHistoryRows, start30d) => {
  const annualHistoryMemberIds = new Set();
  const annualStarts30dIds = new Set();

  annualHistoryRows.forEach(row => {
    if (!row?.member_id) return;
    annualHistoryMemberIds.add(row.member_id);
    const startAt = parseDate(row.annual_start_at);
    if (startAt && startAt >= start30d) {
      annualStarts30dIds.add(row.member_id);
    }
  });

  return { annualHistoryMemberIds, annualStarts30dIds };
};

const backfillMemberProfiles = async (supabase, members) => {
  const missingIds = (members || [])
    .filter(member => {
      if (!member?.member_id) return false;
      const plan = member.plan_summary || {};
      const missingProfile = !member.name || !member.email;
      const missingPlan = !plan.plan_type || plan.total_paid == null || plan.amount == null;
      return missingProfile || missingPlan;
    })
    .map(member => member.member_id);

  if (missingIds.length === 0) return members;

  const { data: cachedProfiles } = await supabase
    .from('ms_members_cache')
    .select('member_id, name, email, created_at, updated_at, raw, plan_summary')
    .in('member_id', missingIds);

  const cacheById = new Map((cachedProfiles || []).map(row => [row.member_id, row]));

  let mergedMembers = (members || []).map(member => {
    const cached = cacheById.get(member.member_id);
    if (!cached) return member;
    const mergedPlanSummary = {
      ...cached.plan_summary,
      ...member.plan_summary
    };
    const hasRaw = member.raw && Object.keys(member.raw).length > 0;
    const raw = hasRaw ? member.raw : (cached.raw || member.raw);
    return {
      ...member,
      name: member.name || cached.name || null,
      email: member.email || cached.email || null,
      created_at: member.created_at || cached.created_at || null,
      updated_at: member.updated_at || cached.updated_at || null,
      raw,
      plan_summary: mergedPlanSummary
    };
  });

  const missingEmailIds = mergedMembers
    .filter(member => member?.member_id && !member.email)
    .map(member => member.member_id);

  if (missingEmailIds.length === 0) return mergedMembers;

  const { data: eventEmails } = await supabase
    .from('academy_plan_events')
    .select('ms_member_id, email, payload, created_at')
    .in('ms_member_id', missingEmailIds)
    .not('email', 'is', null)
    .order('created_at', { ascending: false });

  const emailMap = new Map();
  const nameMap = new Map();
  (eventEmails || []).forEach(row => {
    if (row.ms_member_id && row.email && !emailMap.has(row.ms_member_id)) {
      emailMap.set(row.ms_member_id, row.email);
    }
    if (row.ms_member_id && row.payload && !nameMap.has(row.ms_member_id)) {
      try {
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const extractedName = extractNameFromPayload(payload);
        if (extractedName) {
          nameMap.set(row.ms_member_id, extractedName);
        }
      } catch (error) {
        console.warn('[members] Failed to parse name payload:', error.message);
      }
    }
  });

  mergedMembers = mergedMembers.map(member => {
    if (!member.member_id) return member;
    const fallbackEmail = emailMap.get(member.member_id);
    const fallbackName = nameMap.get(member.member_id);
    return {
      ...member,
      email: member.email || fallbackEmail || null,
      name: member.name || fallbackName || null
    };
  });

  return mergedMembers;
};

const fetchAnnualInvoiceAmounts = async (supabase, memberIds) => {
  if (!memberIds || memberIds.length === 0) return new Map();
  const { data: events } = await supabase
    .from('academy_plan_events')
    .select('ms_member_id, event_type, ms_price_id, payload, created_at')
    .in('ms_member_id', memberIds)
    .eq('event_type', 'invoice.paid')
    .order('created_at', { ascending: false });

  const amountMap = new Map();
  (events || []).forEach(event => {
    const memberId = event.ms_member_id;
    if (!memberId) return;
    const priceId = event.ms_price_id || '';
    if (!priceId.includes('annual') && priceId !== 'prc_annual-membership-jj7y0h89') return;
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      const amount = payload?.data?.object?.amount_paid || payload?.data?.object?.total || 0;
      if (amount > 0) {
        const existingAmount = amountMap.get(memberId) || 0;
        amountMap.set(memberId, existingAmount + amount / 100);
      }
    } catch (error) {
      console.warn('[members] Failed to parse invoice payload:', error.message);
    }
  });

  return amountMap;
};

const fetchConversionEventSets = async (supabase, members, trialHistoryRows, start30d) => {
  if (!members || members.length === 0) {
    return { conversionsAllTimeIds: new Set(), conversions30dIds: new Set() };
  }

  const memberIds = members.map(member => member.member_id).filter(Boolean);
  if (memberIds.length === 0) {
    return { conversionsAllTimeIds: new Set(), conversions30dIds: new Set() };
  }

  const { data: events } = await supabase
    .from('academy_plan_events')
    .select('ms_member_id, event_type, ms_price_id, payload, created_at')
    .in('ms_member_id', memberIds)
    .in('event_type', ['checkout.session.completed', 'invoice.paid'])
    .order('created_at', { ascending: true });

  const timelines = new Map();
  const trialStartEventIds = new Set();
  const trialHistoryIds = new Set((trialHistoryRows || []).map(row => row.member_id).filter(Boolean));
  (events || []).forEach(event => {
    if (!event?.ms_member_id || !event.created_at) return;
    const memberId = event.ms_member_id;
    if (!timelines.has(memberId)) {
      timelines.set(memberId, { trialStartAt: null, annualPaidAt: null });
    }
    const timeline = timelines.get(memberId);
    const eventDate = new Date(event.created_at);
    if (Number.isNaN(eventDate.getTime())) return;

    if (event.event_type === 'checkout.session.completed') {
      const priceId = event.ms_price_id || '';
      if (priceId.includes('trial') || priceId.includes('30-day')) {
        trialStartEventIds.add(memberId);
        if (!timeline.trialStartAt || eventDate < timeline.trialStartAt) {
          timeline.trialStartAt = eventDate;
        }
      }
    }

    if (event.event_type === 'invoice.paid') {
      const priceId = event.ms_price_id || '';
      if (priceId.includes('annual') || priceId === 'prc_annual-membership-jj7y0h89') {
        if (!timeline.annualPaidAt || eventDate < timeline.annualPaidAt) {
          timeline.annualPaidAt = eventDate;
        }
      }
    }
  });

  const conversionsAllTimeIds = new Set();
  const conversions30dIds = new Set();

  const memberMap = new Map(members.map(member => [member.member_id, member]));

  timelines.forEach((timeline, memberId) => {
    if (!timeline.annualPaidAt) return;
    const member = memberMap.get(memberId);
    const createdAt = parseDate(member?.created_at);
    const daysBetween = createdAt
      ? (timeline.annualPaidAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const hadTrial = trialStartEventIds.has(memberId) || trialHistoryIds.has(memberId) || daysBetween > 1;
    if (!hadTrial) return;
    conversionsAllTimeIds.add(memberId);
    if (timeline.annualPaidAt >= start30d) {
      conversions30dIds.add(memberId);
    }
  });

  return { conversionsAllTimeIds, conversions30dIds };
};

const filterSignups = (members, cutoff) => {
  return members.filter(member => {
    const createdAt = parseDate(member.created_at);
    if (!createdAt) return false;
    const status = getPlanStatus(member.plan_summary || {});
    return createdAt >= cutoff && (status === 'ACTIVE' || status === 'TRIALING');
  });
};

const filterTrialsExpiring = (members, memberPlanMap, windowEnd, now) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    if (!planTimeline?.isTrial || !planTimeline.trialEndAt) return false;
    return planTimeline.trialEndAt > now && planTimeline.trialEndAt <= windowEnd;
  });
};

const filterAnnualsExpiring = (members, memberPlanMap, windowEnd, now) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    if (!planTimeline?.isAnnual || !planTimeline.annualEndAt) return false;
    return planTimeline.annualEndAt > now && planTimeline.annualEndAt <= windowEnd;
  });
};

const filterAllExpiring = (members, memberPlanMap, windowEnd, now) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    const trialEnd = planTimeline?.trialEndAt;
    const annualEnd = planTimeline?.annualEndAt;
    const trialMatch = trialEnd && trialEnd > now && trialEnd <= windowEnd;
    const annualMatch = annualEnd && annualEnd > now && annualEnd <= windowEnd;
    return Boolean(trialMatch || annualMatch);
  });
};

const filterNetMemberGrowth = (members, memberPlanMap, start30d, now) => {
  const growthIds = new Set();
  memberPlanMap.forEach(planTimeline => {
    if (planTimeline.isTrial && planTimeline.trialStartAt && planTimeline.trialStartAt >= start30d) {
      growthIds.add(planTimeline.member_id);
    }
    if (planTimeline.isTrial && planTimeline.trialEndAt && planTimeline.trialEndAt >= start30d && planTimeline.trialEndAt <= now) {
      if (!planTimeline.annualStartAt || planTimeline.annualStartAt > planTimeline.trialEndAt) {
        growthIds.add(planTimeline.member_id);
      }
    }
    if (planTimeline.isAnnual && planTimeline.annualEndAt && planTimeline.annualEndAt >= start30d && planTimeline.annualEndAt <= now) {
      growthIds.add(planTimeline.member_id);
    }
  });
  return filterByMemberIds(members, growthIds);
};

const filterNetPaidGrowth = (members, memberPlanMap, start30d, now) => {
  const paidGrowthIds = new Set();
  memberPlanMap.forEach(planTimeline => {
    if (planTimeline.isAnnual && planTimeline.annualStartAt && planTimeline.annualStartAt >= start30d) {
      paidGrowthIds.add(planTimeline.member_id);
    }
    if (planTimeline.isAnnual && planTimeline.annualEndAt && planTimeline.annualEndAt >= start30d && planTimeline.annualEndAt <= now) {
      paidGrowthIds.add(planTimeline.member_id);
    }
  });
  return filterByMemberIds(members, paidGrowthIds);
};

const filterAnnualChurn = (members, memberPlanMap, start90d, now) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    return planTimeline?.isAnnual && planTimeline.annualEndAt && planTimeline.annualEndAt >= start90d && planTimeline.annualEndAt <= now;
  });
};

const filterAtRiskAnnual = (members, memberPlanMap, now, next30d) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    return planTimeline?.isAnnual && planTimeline.annualEndAt && planTimeline.annualEndAt > now && planTimeline.annualEndAt <= next30d;
  });
};

const filterActiveTrials = (members, memberPlanMap, now) => {
  return members.filter(member => {
    const planTimeline = memberPlanMap.get(member.member_id);
    return planTimeline?.isTrial && planTimeline.trialEndAt && planTimeline.trialEndAt > now;
  });
};

const filterDirectAnnual = (members, annualHistoryMemberIds, trialHistoryMemberIds, annualStartAfter) => {
  const directAnnualIds = new Set();
  annualHistoryMemberIds.forEach(memberId => {
    if (!trialHistoryMemberIds.has(memberId)) directAnnualIds.add(memberId);
  });
  members.forEach(member => {
    const isAnnual = member.plan_summary?.plan_type === 'annual';
    const planStart = parseDate(member.plan_summary?.current_period_start) || parseDate(member.created_at);
    if (isAnnual && !trialHistoryMemberIds.has(member.member_id)) {
      if (!annualStartAfter || (planStart && planStart >= annualStartAfter)) {
        directAnnualIds.add(member.member_id);
      }
    }
  });
  return directAnnualIds;
};

const applyLastSeenFilter = (members, lastSeenFilter) => {
  if (!lastSeenFilter) return members;
  if (lastSeenFilter === 'never') {
    return members.filter(member => !member.last_seen);
  }
  const now = new Date();
  let cutoffDate = null;
  if (lastSeenFilter === '24h') {
    cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (lastSeenFilter === '7d') {
    cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (lastSeenFilter === '30d') {
    cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (!cutoffDate) return members;
  return members.filter(member => member.last_seen && new Date(member.last_seen) >= cutoffDate);
};

const normalizeComparable = (value) => {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

const compareSortValues = (aVal, bVal, sortOrder) => {
  const direction = sortOrder === 'asc' ? 1 : -1;
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;
  const aNorm = normalizeComparable(aVal);
  const bNorm = normalizeComparable(bVal);
  if (typeof aNorm === 'number' && typeof bNorm === 'number') {
    return (aNorm - bNorm) * direction;
  }
  if (aNorm === bNorm) return 0;
  return aNorm > bNorm ? direction : -direction;
};

const applyRevenueAllTimeFilter = (membersList) => {
  return membersList.filter(member => {
    const totalPaid = normalizeNumber(member.total_paid) || 0;
    const refundsTotal = normalizeNumber(member.refunds_total) || 0;
    const planType = member.plan_type || '';
    const planName = String(member.plan_name || '').toLowerCase();
    const isPaidPlan = member.is_paid
      || planType === 'annual'
      || planType === 'monthly'
      || planName.includes('annual')
      || planName.includes('monthly');
    return isPaidPlan || totalPaid > 0 || refundsTotal > 0;
  });
};

const filterValidMembers = ({
  baseMembers,
  isExpiredFilter,
  statusFilter,
  hasTileFilter,
  isRevenueAllTimeFilter,
  now
}) => {
  return (baseMembers || []).filter(member => {
    const plan = member.plan_summary || {};
    const planType = plan.plan_type || '';
    const status = getPlanStatus(plan);
    const isTrial = isTrialPlan(plan);
    const hasPlan = planType === 'trial' || planType === 'annual' || isTrial || (isRevenueAllTimeFilter && planType === 'monthly');
    if (!hasPlan) return false;

    if (isExpiredFilter) {
      const endDate = plan.current_period_end || plan.expiry_date;
      if (!endDate) return false;
      const expiry = new Date(endDate);
      return (!Number.isNaN(expiry.getTime()) && expiry < now) || status === 'EXPIRED';
    }

    if (statusFilter) {
      return status === statusFilter.toUpperCase();
    }

    if (!hasTileFilter) {
      return status === 'ACTIVE' || status === 'TRIALING';
    }

    return true;
  });
};

const loadMembersWithHistory = async ({ supabase, baseMembers, isExpiredFilter, tileFilter }) => {
  let nextMembers = baseMembers;
  if (isExpiredFilter) {
    nextMembers = await applyExpiredFilter(supabase, nextMembers, new Date());
  }

  const needsHistory = isExpiredFilter || (tileFilter && HISTORY_FILTER_KEYS.has(tileFilter));
  const historyResult = await loadHistoryMembers(supabase, nextMembers, needsHistory);
  nextMembers = historyResult.baseMembers;

  if (needsHistory && !isExpiredFilter) {
    nextMembers = await backfillMemberProfiles(supabase, nextMembers);
  }

  return {
    baseMembers: nextMembers,
    trialHistoryRows: historyResult.trialHistoryRows,
    annualHistoryRows: historyResult.annualHistoryRows
  };
};

const normalizeSortValue = (value, sortField) => {
  if (value == null || value === '') return null;
  if (['signed_up', 'last_seen', 'plan_expiry_date'].includes(sortField)) {
    return new Date(value).getTime();
  }
  return value;
};

const sortMembers = (members, sortField, sortOrder) => {
  if (!sortField) return members;
  const sorted = [...members];
  sorted.sort((a, b) => {
    const aVal = normalizeSortValue(a[sortField], sortField);
    const bVal = normalizeSortValue(b[sortField], sortField);
    return compareSortValues(aVal, bVal, sortOrder);
  });
  return sorted;
};

const applyActiveNowFilter = async ({ supabase, activeNowFilter, memberIds, validMembers }) => {
  if (!activeNowFilter || memberIds.length === 0) {
    return { memberIds, filteredValidMembers: validMembers };
  }
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentActivities, error: activitiesError } = await supabase
    .from('academy_events')
    .select('member_id')
    .in('member_id', memberIds)
    .gte('created_at', thirtyMinutesAgo);

  if (activitiesError) {
    throw activitiesError;
  }

  const activeMemberIds = new Set((recentActivities || []).map(a => a.member_id));
  const nextMemberIds = memberIds.filter(id => activeMemberIds.has(id));
  const nextMembers = validMembers.filter(m => nextMemberIds.includes(m.member_id));
  return { memberIds: nextMemberIds, filteredValidMembers: nextMembers };
};

const buildMembersQuery = (supabase, planFilter, search) => {
  let query = supabase.from('ms_members_cache').select('*');

  if (planFilter === 'trial') {
    query = query.contains('plan_summary', { is_trial: true });
  } else if (planFilter === 'paid') {
    query = query.contains('plan_summary', { is_paid: true });
  } else if (planFilter === 'annual') {
    query = query.contains('plan_summary', { plan_type: 'annual' });
  } else if (planFilter === 'monthly') {
    query = query.contains('plan_summary', { plan_type: 'monthly' });
  }

  if (search) {
    query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
  }

  return query;
};

const applyTileFilter = async ({
  tileFilter,
  validMembers,
  trialHistoryRows,
  annualHistoryRows,
  now,
  start7d,
  start30d,
  start90d,
  next7d,
  next30d,
  supabase
}) => {
  if (!tileFilter) return validMembers;

  const trialSets = buildTrialHistorySets(trialHistoryRows, start30d, now);
  const annualSets = buildAnnualHistorySets(annualHistoryRows, start30d);
  const memberPlanMap = buildMemberPlanMap(validMembers);

  const handlers = {
    all_members_all_time: () => validMembers,
    signups_24h: () => filterSignups(validMembers, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    signups_7d: () => filterSignups(validMembers, start7d),
    signups_30d: () => filterSignups(validMembers, start30d),
    trials_expiring: () => filterTrialsExpiring(validMembers, memberPlanMap, next30d, now),
    annual_expiring: () => filterAnnualsExpiring(validMembers, memberPlanMap, next30d, now),
    all_expiring: () => filterAllExpiring(validMembers, memberPlanMap, next7d, now),
    trial_conversions_all_time: () => filterByMemberIds(validMembers, trialSets.trialConversionsAllTimeIds),
    trial_conversions_30d: () => filterByMemberIds(validMembers, trialSets.trialConversions30dIds),
    revenue_conversions_all_time: async () => {
      const conversionSets = await fetchConversionEventSets(
        supabase,
        validMembers,
        trialHistoryRows,
        start30d
      );
      return filterByMemberIds(validMembers, conversionSets.conversionsAllTimeIds);
    },
    revenue_conversions_30d: async () => {
      const conversionSets = await fetchConversionEventSets(
        supabase,
        validMembers,
        trialHistoryRows,
        start30d
      );
      return filterByMemberIds(validMembers, conversionSets.conversions30dIds);
    },
    trial_dropoff_30d: () => filterByMemberIds(validMembers, trialSets.trialDropoff30dIds),
    trial_dropoff_all_time: () => filterByMemberIds(validMembers, trialSets.trialDropoffAllTimeIds),
    trials_ended_30d: () => filterByMemberIds(validMembers, trialSets.trialsEnded30dIds),
    annual_all_time: () => {
      const annualIds = new Set(annualSets.annualHistoryMemberIds);
      validMembers.forEach(member => {
        if (member.plan_summary?.plan_type === 'annual') annualIds.add(member.member_id);
      });
      return filterByMemberIds(validMembers, annualIds);
    },
    direct_annual_all_time: () => {
      const directAnnualIds = filterDirectAnnual(validMembers, annualSets.annualHistoryMemberIds, trialSets.trialHistoryMemberIds);
      return filterByMemberIds(validMembers, directAnnualIds);
    },
    arr_active_annual: () => validMembers.filter(member => {
      const planTimeline = memberPlanMap.get(member.member_id);
      return planTimeline?.isAnnual && (planTimeline.status === 'ACTIVE' || planTimeline.status === 'TRIALING');
    }),
    annual_revenue_30d: () => {
      const annualIds = new Set(annualSets.annualStarts30dIds);
      validMembers.forEach(member => {
        const planTimeline = memberPlanMap.get(member.member_id);
        if (planTimeline?.isAnnual && planTimeline.annualStartAt && planTimeline.annualStartAt >= start30d) {
          annualIds.add(member.member_id);
        }
      });
      return filterByMemberIds(validMembers, annualIds);
    },
    direct_annual_30d: () => {
      const directAnnualIds = filterDirectAnnual(validMembers, annualSets.annualHistoryMemberIds, trialSets.trialHistoryMemberIds, start30d);
      return filterByMemberIds(validMembers, directAnnualIds);
    },
    net_member_growth_30d: () => filterNetMemberGrowth(validMembers, memberPlanMap, start30d, now),
    net_paid_growth_30d: () => filterNetPaidGrowth(validMembers, memberPlanMap, start30d, now),
    annual_churn_90d: () => filterAnnualChurn(validMembers, memberPlanMap, start90d, now),
    at_risk_annual_30d: () => filterAtRiskAnnual(validMembers, memberPlanMap, now, next30d),
    trial_opportunity_all: () => filterActiveTrials(validMembers, memberPlanMap, now),
    trial_opportunity_3pct: () => filterTrialsExpiring(validMembers, memberPlanMap, next30d, now),
    at_risk_trials_7d: async () => {
      const expiringTrialIds = new Set();
      if (trialHistoryRows.length > 0) {
        trialHistoryRows.forEach(row => {
          const endAt = parseDate(row.trial_end_at);
          if (endAt && endAt > now && endAt <= next7d && row.member_id) {
            expiringTrialIds.add(row.member_id);
          }
        });
      } else {
        memberPlanMap.forEach(planTimeline => {
          if (planTimeline.isTrial && planTimeline.trialEndAt && planTimeline.trialEndAt > now && planTimeline.trialEndAt <= next7d) {
            expiringTrialIds.add(planTimeline.member_id);
          }
        });
      }

      if (expiringTrialIds.size === 0) return [];

      const { data: recentLogins } = await supabase
        .from('academy_events')
        .select('member_id')
        .eq('event_type', 'login')
        .gte('created_at', start7d.toISOString())
        .in('member_id', Array.from(expiringTrialIds));

      const loggedInIds = new Set((recentLogins || []).map(row => row.member_id).filter(Boolean));
      const atRiskIds = new Set();
      expiringTrialIds.forEach(memberId => {
        if (!loggedInIds.has(memberId)) atRiskIds.add(memberId);
      });
      return filterByMemberIds(validMembers, atRiskIds);
    }
  };

  const handler = handlers[tileFilter];
  if (!handler) return validMembers;
  return await handler();
};

const applyExpiredFilter = async (supabase, baseMembers, now) => {
  const cacheById = new Map(baseMembers.map(member => [member.member_id, member]));
  const nowIso = now.toISOString();

  const { data: expiredTrialHistory } = await supabase
    .from('academy_trial_history')
    .select('member_id, trial_end_at')
    .lte('trial_end_at', nowIso);

  const { data: expiredAnnualHistory } = await supabase
    .from('academy_annual_history')
    .select('member_id, annual_end_at')
    .lte('annual_end_at', nowIso);

  const expiredMap = new Map();
  const expiredIds = new Set();

  (expiredTrialHistory || []).forEach(row => {
    if (!row?.member_id || !row.trial_end_at) return;
    expiredIds.add(row.member_id);
    const cached = cacheById.get(row.member_id);
    if (cached) {
      expiredMap.set(row.member_id, cached);
    } else {
      expiredMap.set(row.member_id, {
        member_id: row.member_id,
        email: null,
        name: null,
        created_at: null,
        updated_at: null,
        raw: {},
        plan_summary: {
          plan_type: 'trial',
          plan_name: 'Academy Trial',
          status: 'expired',
          expiry_date: row.trial_end_at,
          is_trial: true
        }
      });
    }
  });

  (expiredAnnualHistory || []).forEach(row => {
    if (!row?.member_id || !row.annual_end_at) return;
    expiredIds.add(row.member_id);
    const cached = cacheById.get(row.member_id);
    if (cached) {
      expiredMap.set(row.member_id, cached);
    } else {
      expiredMap.set(row.member_id, {
        member_id: row.member_id,
        email: null,
        name: null,
        created_at: null,
        updated_at: null,
        raw: {},
        plan_summary: {
          plan_type: 'annual',
          plan_name: 'Academy Annual',
          status: 'expired',
          expiry_date: row.annual_end_at,
          is_paid: true
        }
      });
    }
  });

  const expiredIdList = Array.from(expiredIds);
  if (expiredIdList.length === 0) return baseMembers;

  const { data: expiredProfiles } = await supabase
    .from('ms_members_cache')
    .select('member_id, name, email')
    .in('member_id', expiredIdList);

  const profileMap = new Map((expiredProfiles || []).map(p => [p.member_id, p]));

  const { data: eventEmails } = await supabase
    .from('academy_plan_events')
    .select('ms_member_id, email, payload, created_at')
    .in('ms_member_id', expiredIdList)
    .not('email', 'is', null)
    .order('created_at', { ascending: false });

  const emailMap = new Map();
  const nameMap = new Map();
  (eventEmails || []).forEach(row => {
    if (row.ms_member_id && row.email && !emailMap.has(row.ms_member_id)) {
      emailMap.set(row.ms_member_id, row.email);
    }
    if (row.ms_member_id && row.payload && !nameMap.has(row.ms_member_id)) {
      try {
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const extractedName = extractNameFromPayload(payload);
        if (extractedName) {
          nameMap.set(row.ms_member_id, extractedName);
        }
      } catch (error) {
        console.warn('[members] Failed to parse name payload:', error.message);
      }
    }
  });

  expiredIdList.forEach(memberId => {
    const existing = expiredMap.get(memberId);
    if (!existing) return;
    const profile = profileMap.get(memberId);
    const email = profile?.email || emailMap.get(memberId) || existing.email || null;
    const name = profile?.name || nameMap.get(memberId) || existing.name || null;
    expiredMap.set(memberId, { ...existing, email, name });
  });

  return Array.from(expiredMap.values());
};

const loadHistoryMembers = async (supabase, baseMembers, needsHistory) => {
  if (!needsHistory) {
    return { baseMembers, trialHistoryRows: [], annualHistoryRows: [] };
  }

  const { data: trialHistory } = await supabase
    .from('academy_trial_history')
    .select('member_id, trial_start_at, trial_end_at, converted_at');
  const trialHistoryRows = Array.isArray(trialHistory) ? trialHistory : [];

  const { data: annualHistory } = await supabase
    .from('academy_annual_history')
    .select('member_id, annual_start_at, annual_end_at');
  const annualHistoryRows = Array.isArray(annualHistory) ? annualHistory : [];

  const cacheById = new Map(baseMembers.map(member => [member.member_id, member]));
  const trialHistoryByMember = new Map();
  const annualHistoryByMember = new Map();

  trialHistoryRows.forEach(row => {
    if (!row?.member_id) return;
    if (!trialHistoryByMember.has(row.member_id)) {
      trialHistoryByMember.set(row.member_id, row);
      return;
    }
    const existing = trialHistoryByMember.get(row.member_id);
    const existingEnd = parseDate(existing?.trial_end_at);
    const nextEnd = parseDate(row.trial_end_at);
    if (nextEnd && (!existingEnd || nextEnd > existingEnd)) {
      trialHistoryByMember.set(row.member_id, row);
    }
  });

  annualHistoryRows.forEach(row => {
    if (!row?.member_id) return;
    if (!annualHistoryByMember.has(row.member_id)) {
      annualHistoryByMember.set(row.member_id, row);
      return;
    }
    const existing = annualHistoryByMember.get(row.member_id);
    const existingStart = parseDate(existing?.annual_start_at);
    const nextStart = parseDate(row.annual_start_at);
    if (nextStart && (!existingStart || nextStart > existingStart)) {
      annualHistoryByMember.set(row.member_id, row);
    }
  });

  const historyMemberIds = new Set([
    ...Array.from(trialHistoryByMember.keys()),
    ...Array.from(annualHistoryByMember.keys())
  ]);

  historyMemberIds.forEach(memberId => {
    if (cacheById.has(memberId)) return;
    const trialRow = trialHistoryByMember.get(memberId);
    const annualRow = annualHistoryByMember.get(memberId);
    if (annualRow) {
      baseMembers.push({
        member_id: memberId,
        email: null,
        name: null,
        created_at: null,
        updated_at: null,
        raw: {},
        plan_summary: {
          plan_type: 'annual',
          plan_name: 'Academy Annual',
          status: 'expired',
          current_period_end: annualRow.annual_end_at || null,
          is_trial: false,
          is_paid: true
        }
      });
      return;
    }
    if (trialRow) {
      baseMembers.push({
        member_id: memberId,
        email: null,
        name: null,
        created_at: null,
        updated_at: null,
        raw: {},
        plan_summary: {
          plan_type: 'trial',
          plan_name: 'Academy Trial',
          status: 'expired',
          expiry_date: trialRow.trial_end_at || null,
          is_trial: true,
          is_paid: false
        }
      });
    }
  });

  return { baseMembers, trialHistoryRows, annualHistoryRows };
};

async function handleMembers(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse query params
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    
    const planFilter = req.query.plan; // 'trial', 'paid', 'annual', 'monthly'
    const statusFilter = req.query.status; // 'active', 'trialing', 'canceled'
    const search = req.query.search; // name or email search
    const lastSeenFilter = req.query.last_seen; // '24h', '7d', '30d', 'never'
    const activeNowFilter = req.query.active_now === 'true'; // filter to members with recent activity (last 30 min)
    const tileFilter = req.query.filter; // custom tile cohort filter
    const sortField = req.query.sort || 'updated_at'; // field to sort by
    const sortOrder = req.query.order || 'desc'; // 'asc' or 'desc'

    const now = new Date();
    const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const next30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Build query - by default, only show members with trial or annual plans
    // This excludes test accounts and members without valid plans
    const query = buildMembersQuery(supabase, planFilter, search);

    // Status filter is applied in JS below to handle case differences and expired logic

    // For server-side sorting, we need to fetch ALL members first, then sort and paginate
    // This is because some sort fields are computed (like modules_opened_unique, exams_attempted)
    // So we'll fetch all, enrich, sort, then paginate
    
    // Get total count first (before pagination)
    // Fetch ALL members (no pagination yet) - we'll sort and paginate after enrichment
    // Use a reasonable limit to prevent memory issues (e.g., 1000 members max)
    const { data: members, error } = await query.order('updated_at', { ascending: false }).limit(1000);

    if (error) {
      throw error;
    }

    const isExpiredFilter = statusFilter === 'expired';
    const isRevenueAllTimeFilter = tileFilter === 'revenue_all_time';
    let baseMembers = members || [];

    const historyResult = await loadMembersWithHistory({
      supabase,
      baseMembers,
      isExpiredFilter,
      tileFilter
    });
    baseMembers = historyResult.baseMembers;
    let { trialHistoryRows, annualHistoryRows } = historyResult;

    const hasTileFilter = Boolean(tileFilter);

    // Filter out test accounts and members without valid plans (trial or annual)
    // Default to ACTIVE/TRIALING unless status filter requests otherwise
    const validMembers = filterValidMembers({
      baseMembers,
      isExpiredFilter,
      statusFilter,
      hasTileFilter,
      isRevenueAllTimeFilter,
      now
    });

    // Enrich with engagement stats (last seen, modules opened, exams, bookmarks)
    let filteredValidMembers = await applyTileFilter({
      tileFilter,
      validMembers,
      trialHistoryRows,
      annualHistoryRows,
      now,
      start7d,
      start30d,
      start90d,
      next7d,
      next30d,
      supabase
    });
    let memberIds = filteredValidMembers.map(m => m.member_id);
    
    const activeNowResult = await applyActiveNowFilter({
      supabase,
      activeNowFilter,
      memberIds,
      validMembers: filteredValidMembers
    });
    memberIds = activeNowResult.memberIds;
    filteredValidMembers = activeNowResult.filteredValidMembers;

    const invoiceAmountFilters = new Set([
      'trial_conversions_all_time',
      'trial_conversions_30d',
      'revenue_conversions_all_time',
      'revenue_conversions_30d',
      'revenue_all_time',
      'direct_annual_all_time',
      'direct_annual_30d',
      'annual_revenue_30d',
      'annual_all_time'
    ]);
    const shouldFetchInvoiceAmounts = tileFilter && invoiceAmountFilters.has(tileFilter);
    const invoiceAmounts = shouldFetchInvoiceAmounts
      ? await fetchAnnualInvoiceAmounts(supabase, memberIds)
      : new Map();
    const invoiceEmailTotalsResult = tileFilter === 'revenue_all_time'
      ? await fetchStripeInvoiceEmailTotals(filteredValidMembers)
      : { totalsByEmail: new Map(), refundsByEmail: new Map() };
    const stripeTotalsByEmail = shouldFetchInvoiceAmounts
      ? await fetchStripeTotalsByEmail(filteredValidMembers)
      : new Map();
    const stripeRefundsByEmail = shouldFetchInvoiceAmounts
      ? await fetchStripeRefundsByEmail(filteredValidMembers)
      : new Map();
    
    // If no member IDs after filtering, return empty result
    if (memberIds.length === 0) {
      return res.status(200).json({
        members: [],
        pagination: {
          page: 1,
          limit: limit,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    // Get last activity per member - use a more efficient query
    // Get the most recent event per member by using a subquery approach
    async function fetchAllEvents({ eventType }) {
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      const all = [];
      while (hasMore) {
        let query = supabase
          .from('academy_events')
          .select('member_id, created_at')
          .in('member_id', memberIds)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (eventType) {
          query = query.eq('event_type', eventType);
        }
        const { data: page, error: pageError } = await query;
        if (pageError) {
          throw pageError;
        }
        const rows = page || [];
        all.push(...rows);
        hasMore = rows.length === pageSize;
        from += pageSize;
      }
      return all;
    }

    const activities = await fetchAllEvents({ eventType: null });
    const logins = await fetchAllEvents({ eventType: 'login' });

    // Get module opens count per member
    const { data: moduleOpens } = await supabase
      .from('academy_events')
      .select('member_id, path')
      .eq('event_type', 'module_open')
      .in('member_id', memberIds);

    // Get exam stats per member from module_results_ms
    // First try by memberstack_id, then also check by email for legacy data
    const { data: examStatsById } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .in('memberstack_id', memberIds);
    
    // Also get exams by email for legacy data (members who haven't migrated yet)
    const memberEmails = members?.map(m => m.email).filter(Boolean) || [];
    const { data: examStatsByEmail } = memberEmails.length > 0 ? await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .in('email', memberEmails) : { data: [] };
    
    // Combine both results
    const examStats = [...(examStatsById || []), ...(examStatsByEmail || [])];

    // Get bookmark count per member
    const { data: bookmarks } = await supabase
      .from('academy_events')
      .select('member_id')
      .eq('event_type', 'bookmark_add')
      .in('member_id', memberIds);

  // Get latest Hue Test total score per member
  const { data: hueResults, error: hueError } = await supabase
    .from('academy_hue_test_results')
    .select('member_id, total_score, created_at')
    .in('member_id', memberIds)
    .order('created_at', { ascending: false });

  if (hueError) {
    console.error('[members] Hue test fetch error:', hueError);
  }

    // Build lookup maps
    const lastSeenMap = {};
    activities?.forEach(activity => {
      const memberId = activity.member_id;
      if (!lastSeenMap[memberId] || new Date(activity.created_at) > new Date(lastSeenMap[memberId])) {
        lastSeenMap[memberId] = activity.created_at;
      }
    });
    
    // Build last login map (get 2nd most recent login as "last login", or most recent if only one)
    const lastLoginMap = {};
    const loginEventsByMember = {};
    logins?.forEach(login => {
      const memberId = login.member_id;
      if (!loginEventsByMember[memberId]) {
        loginEventsByMember[memberId] = [];
      }
      loginEventsByMember[memberId].push(login.created_at);
    });
    
    // For each member, get the 2nd most recent login (previous login) or most recent if only one
    Object.keys(loginEventsByMember).forEach(memberId => {
      const loginTimes = loginEventsByMember[memberId].sort((a, b) => new Date(b) - new Date(a));
      const now = new Date();
      const mostRecent = new Date(loginTimes[0]);
      const twoMinutesAgo = 2 * 60 * 1000;
      
      // If most recent login is very recent (within 2 min), use 2nd one as "last login"
      // Otherwise use most recent
      if (loginTimes.length >= 2 && (now.getTime() - mostRecent.getTime()) < twoMinutesAgo) {
        lastLoginMap[memberId] = loginTimes[1]; // Previous login
      } else {
        lastLoginMap[memberId] = loginTimes[0]; // Most recent login
      }
    });

    const moduleOpensMap = {};
    const uniqueModulesMap = {};
    moduleOpens?.forEach(open => {
      const memberId = open.member_id;
      moduleOpensMap[memberId] = (moduleOpensMap[memberId] || 0) + 1;
      if (!uniqueModulesMap[memberId]) uniqueModulesMap[memberId] = new Set();
      uniqueModulesMap[memberId].add(open.path);
    });

    // Build map by member_id first, then by email for legacy data
    const examStatsMap = {};
    const examStatsByEmailMap = {};
    
    examStats?.forEach(exam => {
      // Try to match by memberstack_id first
      const memberId = exam.memberstack_id;
      if (memberIds.includes(memberId)) {
        if (!examStatsMap[memberId]) {
          examStatsMap[memberId] = { attempts: 0, passed: 0 };
        }
        examStatsMap[memberId].attempts++;
        if (exam.passed) examStatsMap[memberId].passed++;
      } else if (exam.email) {
        // For legacy data, match by email
        if (!examStatsByEmailMap[exam.email]) {
          examStatsByEmailMap[exam.email] = { attempts: 0, passed: 0 };
        }
        examStatsByEmailMap[exam.email].attempts++;
        if (exam.passed) examStatsByEmailMap[exam.email].passed++;
      }
    });

    const bookmarksMap = {};
    bookmarks?.forEach(bookmark => {
      const memberId = bookmark.member_id;
      bookmarksMap[memberId] = (bookmarksMap[memberId] || 0) + 1;
    });

  const hueScoreMap = {};
  hueResults?.forEach(result => {
    if (hueScoreMap[result.member_id] == null) {
      hueScoreMap[result.member_id] = result.total_score;
    }
  });

    // Enrich members with stats from both Supabase events AND Memberstack JSON
    let enrichedMembers = filteredValidMembers?.map(member => {
      const memberId = member.member_id;
      const plan = member.plan_summary || {};
      
      // Get modules and bookmarks from Memberstack JSON (raw field)
      const raw = member.raw || {};
      const json = raw?.json || raw?.data?.json || raw;
      const arAcademy = json?.arAcademy || {};
      const modules = arAcademy?.modules || {};
      const opened = modules?.opened || {};
      // Bookmarks are at root level: json.bookmarks, not json.arAcademy.bookmarks
      const bookmarks = json?.bookmarks || [];
      
      // Count unique modules from Memberstack JSON
      const modulesFromJson = Object.keys(opened).filter(Boolean).length;
      const totalOpensFromJson = Object.values(opened).reduce((sum, m) => sum + (m.count || 1), 0);
      
      // Use Memberstack JSON data if available, otherwise fall back to events
      const modulesOpenedUnique = modulesFromJson > 0 ? modulesFromJson : (uniqueModulesMap[memberId]?.size || 0);
      const modulesOpenedTotal = totalOpensFromJson > 0 ? totalOpensFromJson : (moduleOpensMap[memberId] || 0);
      const bookmarksCount = Array.isArray(bookmarks) ? bookmarks.length : (bookmarksMap[memberId] || 0);
      
      // Get expiry date: for trials use expiry_date, for annual use current_period_end
      const expiryDate = plan.is_trial ? plan.expiry_date : (plan.current_period_end || plan.expiry_date);
      
      const currency =
        plan.currency ||
        plan.currency_code ||
        plan.plan_currency ||
        plan.price_currency ||
        plan.default_currency ||
        'GBP';
      const totalPaid = normalizeNumber(
        plan.total_paid ??
        plan.lifetime_value ??
        plan.lifetime_paid ??
        plan.total_spent ??
        null
      );
      const currentAmount = normalizeNumber(
        plan.amount ??
        plan.plan_amount ??
        plan.unit_amount ??
        plan.price ??
        plan.subscription_amount ??
        null
      );
      const refundsTotal = normalizeNumber(
        plan.refunds_total ??
        plan.amount_refunded ??
        plan.refunded ??
        null
      );
      const invoiceAmount = invoiceAmounts.get(memberId);
      const emailKey = normalizeEmailKey(member.email);
      const invoiceEmailTotal = emailKey ? invoiceEmailTotalsResult.totalsByEmail.get(emailKey) : null;
      const stripeTotal = emailKey ? stripeTotalsByEmail.get(emailKey) : null;
      const resolvedTotalPaid = totalPaid ?? invoiceAmount ?? invoiceEmailTotal ?? stripeTotal ?? null;
      const invoiceEmailRefund = emailKey ? invoiceEmailTotalsResult.refundsByEmail.get(emailKey) : null;
      const stripeRefundTotal = emailKey ? stripeRefundsByEmail.get(emailKey) : null;
      const preferredRefundTotal = invoiceEmailRefund ?? stripeRefundTotal;
      const resolvedRefundsTotal = preferredRefundTotal != null && (refundsTotal == null || preferredRefundTotal > refundsTotal)
        ? preferredRefundTotal
        : (refundsTotal ?? preferredRefundTotal ?? null);

      return {
        member_id: memberId,
        email: member.email,
        name: member.name,
        plan_name: plan.plan_name || 'No Plan',
        plan_type: plan.plan_type || null,
        status: plan.status || 'unknown',
        is_trial: plan.is_trial || false,
        is_paid: plan.is_paid || false,
        signed_up: member.created_at,
        last_seen: lastSeenMap[memberId] || null,
        last_login: lastLoginMap[memberId] || null,
        plan_expiry_date: expiryDate,
        modules_opened_unique: modulesOpenedUnique,
        modules_opened_total: modulesOpenedTotal,
        // Combine exam stats by member_id and by email (for legacy data)
        exams_attempted: (examStatsMap[memberId]?.attempts || 0) + (examStatsByEmailMap[member.email]?.attempts || 0),
        exams_passed: (examStatsMap[memberId]?.passed || 0) + (examStatsByEmailMap[member.email]?.passed || 0),
        bookmarks_count: bookmarksCount,
        photography_style: member.photography_style || null,
        hue_test_score: hueScoreMap[memberId] ?? null,
        currency,
        total_paid: resolvedTotalPaid,
        current_amount: currentAmount,
        refunds_total: resolvedRefundsTotal
      };
    }) || [];

    // Apply revenue filter post-enrichment
    if (tileFilter === 'revenue_all_time') {
      enrichedMembers = applyRevenueAllTimeFilter(enrichedMembers);
    }

    // Apply last_seen filter if specified
    let filteredMembers = applyLastSeenFilter(enrichedMembers, lastSeenFilter);

    // Apply server-side sorting
    filteredMembers = sortMembers(filteredMembers, sortField, sortOrder);

    // Apply pagination AFTER sorting
    const totalFiltered = filteredMembers.length;
    const paginatedMembers = filteredMembers.slice(offset, offset + limit);

    return res.status(200).json({
      members: paginatedMembers,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit)
      }
    });

  } catch (error) {
    console.error('[members] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = handleMembers;
