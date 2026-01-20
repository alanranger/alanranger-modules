import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Script from 'next/script';

/**
 * Checkout redirect page for trial members upgrading to annual membership
 * This page automatically initiates Memberstack checkout for the member
 * 
 * Query parameters:
 * - memberId: Memberstack member ID (optional, will use logged-in member if not provided)
 * - priceId: Memberstack price ID (defaults to annual membership)
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { memberId, priceId } = router.query;

  useEffect(() => {
    // Wait for Memberstack to load
    if (typeof window === 'undefined' || !window.$memberstackDom) {
      // Check if Memberstack is loading
      const checkMemberstack = setInterval(() => {
        if (window.$memberstackDom) {
          clearInterval(checkMemberstack);
          initiateCheckout();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkMemberstack);
        if (!window.$memberstackDom) {
          console.error('Memberstack failed to load');
          router.push('/academy/login?error=checkout_failed');
        }
      }, 10000);

      return () => clearInterval(checkMemberstack);
    } else {
      initiateCheckout();
    }
  }, [memberId, priceId]);

  async function initiateCheckout() {
    try {
      const ms = window.$memberstackDom;
      if (!ms) {
        throw new Error('Memberstack not available');
      }

      // Get current member if memberId not provided
      let targetMemberId = memberId;
      if (!targetMemberId) {
        const currentMember = await ms.getCurrentMember();
        if (currentMember && currentMember.data) {
          targetMemberId = currentMember.data.id;
        }
      }

      // Use the price ID from query or default to annual membership
      const targetPriceId = priceId || 'prc_annual-membership-jj7y0h89';

      // Create checkout session
      const checkoutResult = await ms.purchasePlansWithCheckout({
        priceId: targetPriceId,
        successUrl: 'https://www.alanranger.com/academy/dashboard',
        cancelUrl: 'https://www.alanranger.com/academy/login',
        autoRedirect: true
      });

      // If checkout URL is returned, redirect to it
      if (checkoutResult && checkoutResult.data && checkoutResult.data.url) {
        window.location.href = checkoutResult.data.url;
      } else {
        // If no URL, Memberstack should have already redirected
        // But if we're still here, show an error
        console.error('Checkout URL not returned');
        router.push('/academy/login?error=checkout_failed');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      router.push('/academy/login?error=checkout_failed');
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0b0f14',
      color: '#f9fafb',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>
        Redirecting to secure checkout...
      </div>
      <div style={{ fontSize: '14px', color: '#9ca3af' }}>
        Please wait while we prepare your upgrade
      </div>
    </div>
  );
}
