import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  BookOpen,
  MapPin,
  ShieldCheck,
  FileText,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Train,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Clock,
  Sparkles,
  Info,
  Calendar,
  CreditCard,
  UserCheck,
} from 'lucide-react';

export const CANONICAL_STATIONS = [
  // Delhi NCR Cluster
  { code: 'NDLS', name: 'New Delhi', city: 'Delhi', state: 'Delhi', zone: 'NR', cluster: 'Delhi NCR', major: true },
  { code: 'DLI', name: 'Old Delhi Jn', city: 'Delhi', state: 'Delhi', zone: 'NR', cluster: 'Delhi NCR', major: true },
  { code: 'NZM', name: 'Hazrat Nizamuddin', city: 'Delhi', state: 'Delhi', zone: 'NR', cluster: 'Delhi NCR', major: true },
  { code: 'ANVT', name: 'Anand Vihar Terminal', city: 'Delhi', state: 'Delhi', zone: 'NR', cluster: 'Delhi NCR', major: true },
  { code: 'DEE', name: 'Delhi Sarai Rohilla', city: 'Delhi', state: 'Delhi', zone: 'NR', cluster: 'Delhi NCR', major: false },

  // Mumbai Metropolitan Cluster
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', cluster: 'Mumbai Region', major: true },
  { code: 'MMCT', name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra', zone: 'WR', cluster: 'Mumbai Region', major: true },
  { code: 'BDTS', name: 'Bandra Terminus', city: 'Mumbai', state: 'Maharashtra', zone: 'WR', cluster: 'Mumbai Region', major: true },
  { code: 'DR', name: 'Dadar Central / Western', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', cluster: 'Mumbai Region', major: true },
  { code: 'LTT', name: 'Lokmanya Tilak Terminus', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', cluster: 'Mumbai Region', major: true },

  // Patna & Magadh Cluster
  { code: 'PNBE', name: 'Patna Junction', city: 'Patna', state: 'Bihar', zone: 'ECR', cluster: 'Patna Hub', major: true },
  { code: 'DNR', name: 'Danapur', city: 'Patna', state: 'Bihar', zone: 'ECR', cluster: 'Patna Hub', major: true },
  { code: 'PPTA', name: 'Patliputra Junction', city: 'Patna', state: 'Bihar', zone: 'ECR', cluster: 'Patna Hub', major: true },
  { code: 'RJPB', name: 'Rajendra Nagar Terminal', city: 'Patna', state: 'Bihar', zone: 'ECR', cluster: 'Patna Hub', major: true },

  // Kolkata Hub Cluster
  { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata', state: 'West Bengal', zone: 'ER', cluster: 'Kolkata Hub', major: true },
  { code: 'SDAH', name: 'Sealdah', city: 'Kolkata', state: 'West Bengal', zone: 'ER', cluster: 'Kolkata Hub', major: true },
  { code: 'KOAA', name: 'Kolkata Terminal', city: 'Kolkata', state: 'West Bengal', zone: 'ER', cluster: 'Kolkata Hub', major: true },
  { code: 'SHM', name: 'Shalimar', city: 'Howrah', state: 'West Bengal', zone: 'SER', cluster: 'Kolkata Hub', major: false },

  // Bengaluru Hub Cluster
  { code: 'SBC', name: 'KSR Bengaluru City', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', cluster: 'Bengaluru Hub', major: true },
  { code: 'YPR', name: 'Yesvantpur Junction', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', cluster: 'Bengaluru Hub', major: true },
  { code: 'SMVB', name: 'SMVT Bengaluru', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', cluster: 'Bengaluru Hub', major: true },
  { code: 'KJM', name: 'Krishnarajapuram', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', cluster: 'Bengaluru Hub', major: false },

  // Chennai Hub Cluster
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai', state: 'Tamil Nadu', zone: 'SR', cluster: 'Chennai Hub', major: true },
  { code: 'MS', name: 'Chennai Egmore', city: 'Chennai', state: 'Tamil Nadu', zone: 'SR', cluster: 'Chennai Hub', major: true },
  { code: 'TBM', name: 'Tambaram', city: 'Chennai', state: 'Tamil Nadu', zone: 'SR', cluster: 'Chennai Hub', major: false },

  // Key Strategic Junctions & Transit Corridors
  { code: 'CNB', name: 'Kanpur Central', city: 'Kanpur', state: 'Uttar Pradesh', zone: 'NCR', cluster: 'Transit Hubs', major: true },
  { code: 'PRYJ', name: 'Prayagraj Junction (Allahabad)', city: 'Prayagraj', state: 'Uttar Pradesh', zone: 'NCR', cluster: 'Transit Hubs', major: true },
  { code: 'DDU', name: 'Pt. Deen Dayal Upadhyaya (Mughalsarai)', city: 'Mughalsarai', state: 'Uttar Pradesh', zone: 'ECR', cluster: 'Transit Hubs', major: true },
  { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow', state: 'Uttar Pradesh', zone: 'NR', cluster: 'Transit Hubs', major: true },
  { code: 'BSB', name: 'Varanasi Junction', city: 'Varanasi', state: 'Uttar Pradesh', zone: 'NR', cluster: 'Transit Hubs', major: true },
  { code: 'GKP', name: 'Gorakhpur Junction', city: 'Gorakhpur', state: 'Uttar Pradesh', zone: 'NER', cluster: 'Transit Hubs', major: true },
  { code: 'BZA', name: 'Vijayawada Junction', city: 'Vijayawada', state: 'Andhra Pradesh', zone: 'SCR', cluster: 'Transit Hubs', major: true },
  { code: 'SC', name: 'Secunderabad Junction', city: 'Hyderabad', state: 'Telangana', zone: 'SCR', cluster: 'Transit Hubs', major: true },
  { code: 'ADI', name: 'Ahmedabad Junction', city: 'Ahmedabad', state: 'Gujarat', zone: 'WR', cluster: 'Transit Hubs', major: true },
  { code: 'PUNE', name: 'Pune Junction', city: 'Pune', state: 'Maharashtra', zone: 'CR', cluster: 'Transit Hubs', major: true },
  { code: 'GHY', name: 'Guwahati', city: 'Guwahati', state: 'Assam', zone: 'NFR', cluster: 'Transit Hubs', major: true },
];

export const FAQS = [
  {
    category: 'Routing & Recovery',
    question: 'How does Same-Train Split ("Stay on this Train") work?',
    answer:
      'When through-train seats are waitlisted or unavailable from your origin to destination, Yatrai algorithmically evaluates intermediate junction splits (e.g., NDLS to Kanpur, and Kanpur to Patna on the same train number). Because both legs use the exact same train rake, you do not need to disembark or change trains at the intermediate junction. You hold two tickets; only your coach/berth may change at the junction.',
  },
  {
    category: 'Routing & Recovery',
    question: 'What is Route Extension (Strategy A)?',
    answer:
      'Under Strategy A, if your desired trip from station A to station B is waitlisted, but booking to a farther station Y (where Y is after B on the same train route) has confirmed seats available under higher quota allocations, Yatrai suggests booking through to Y while safely deboarding early at station B. In strict accordance with Indian Railways commercial rules, Strategy B (booking from an earlier station and boarding late) is strictly excluded.',
  },
  {
    category: 'Routing & Recovery',
    question: 'How do Cross-Train Junction Connections work?',
    answer:
      'Yatrai builds verified 2-leg connections through major railway hubs (such as Kanpur, Prayagraj, Pt. Deen Dayal Upadhyaya, and Lucknow). Transfer layovers are strictly validated between 90 minutes (to provide a comfortable, realistic buffer for minor train delays) and 600 minutes. Connecting itineraries with layovers under 180 minutes display a "Tight connection" advisory badge.',
  },
  {
    category: 'Seats & Pricing',
    question: 'What does the "?" chip on train cards mean?',
    answer:
      'Train cards display confirmed seat availability for primary classes. To preserve live RailKit API quotas and deliver sub-40ms page loads, unqueried classes show a "?" chip. Clicking any chip triggers an instant single-flight availability check and updates that class in place.',
  },
  {
    category: 'Seats & Pricing',
    question: 'How is total fare calculated on multi-leg journeys?',
    answer:
      'Yatrai calculates the exact sum of individual leg fares according to Indian Railways telescopic distance tariffs for each class (1A, 2A, 3A, 3E, SL, CC, 2S). Yatrai maintains a 100% transparent pricing policy with ₹0 hidden convenience markups.',
  },
  {
    category: 'Booking & Handoff',
    question: 'Do multi-leg journeys need separate IRCTC PNR bookings?',
    answer:
      'Yes. Per Indian Railways and IRCTC regulations, cross-train connecting journeys or two-leg splits require separate PNR bookings. Yatrai records your verified journey details, generates a branded 2-Page Electronic Reservation Slip (ERS) with a scannable verification QR code, and provides direct booking handoff to official IRCTC channels.',
  },
  {
    category: 'Booking & Handoff',
    question: 'Can I check any PNR status across accounts?',
    answer:
      'Yes! In Indian Railways PRS, the 10-digit PNR is a universal reservation token. You can check any authentic IRCTC ticket (e.g. 2846526889) or any Yatrai recovery booking from any device or account, view the full itinerary, and download the official PDF reservation slip.',
  },
];

export function HelpGuidanceModal({
  isOpen,
  onClose,
  initialTab = 'faq',
  onSelectStation,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [expandedFaqIndex, setExpandedFaqIndex] = useState(0);
  const [faqFilter, setFaqFilter] = useState('All');
  const [stationSearch, setStationSearch] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('All');

  // Sync activeTab when initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    if (faqFilter === 'All') return FAQS;
    return FAQS.filter((f) => f.category === faqFilter);
  }, [faqFilter]);

  // Filtered Canonical Stations
  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    return CANONICAL_STATIONS.filter((s) => {
      const matchCluster = selectedCluster === 'All' || s.cluster === selectedCluster;
      if (!matchCluster) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q)
      );
    });
  }, [stationSearch, selectedCluster]);

  const clusters = useMemo(() => {
    const set = new Set(CANONICAL_STATIONS.map((s) => s.cluster));
    return ['All', ...Array.from(set)];
  }, []);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guidance-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl my-auto flex flex-col max-h-[92vh] rounded-2xl border border-[#303640] bg-[#12151A] text-[#EDEFF2] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header with Brand & Close ── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#303640] bg-[#15191F]/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1C222B] border border-[#303640] text-[#E8B04A]">
              {activeTab === 'faq' && <HelpCircle className="h-5 w-5" />}
              {activeTab === 'guidelines' && <BookOpen className="h-5 w-5" />}
              {activeTab === 'stations' && <MapPin className="h-5 w-5" />}
              {activeTab === 'privacy' && <ShieldCheck className="h-5 w-5" />}
              {activeTab === 'terms' && <FileText className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="help-guidance-title" className="text-base sm:text-lg font-serif font-bold text-[#F0F1F3]">
                  Yatrai Knowledge &amp; Standards
                </h2>
                <span className="hidden sm:inline-flex items-center rounded-full bg-[#E8B04A]/10 border border-[#E8B04A]/25 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                  Verified
                </span>
              </div>
              <p className="text-[11px] text-[#A7AFBA]">
                Operational guidelines, canonical station directory, and commercial railway standards.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#303640] bg-[#1C222B] p-2 text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#424A56] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Navigation Tabs Bar ── */}
        <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 bg-[#101317] border-b border-[#303640] overflow-x-auto shrink-0 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'faq'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-bold shadow-sm'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181D24]'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Help &amp; FAQs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guidelines')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'guidelines'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-bold shadow-sm'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181D24]'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Booking Guidelines</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stations')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'stations'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-bold shadow-sm'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181D24]'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>Canonical Station Codes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-bold shadow-sm'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181D24]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'terms'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-bold shadow-sm'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181D24]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Terms of Service</span>
          </button>
        </div>

        {/* ── Tab Content Container ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* ════════════════════ TAB 1: HELP & FAQS ════════════════════ */}
          {activeTab === 'faq' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F0F1F3] uppercase tracking-wider">
                    Frequently Asked Questions
                  </h3>
                  <p className="text-xs text-[#A7AFBA] mt-0.5">
                    Clear answers regarding journey recovery, split ticketing, telescopic tariffs, and IRCTC handoffs.
                  </p>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1 bg-[#181D24] p-1 rounded-lg border border-[#303640] text-[11px]">
                  {['All', 'Routing & Recovery', 'Seats & Pricing', 'Booking & Handoff'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFaqFilter(cat)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        faqFilter === cat
                          ? 'bg-[#E8B04A] text-[#0B0D10] font-bold'
                          : 'text-[#A7AFBA] hover:text-[#F0F1F3]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* FAQ Accordions */}
              <div className="space-y-3">
                {filteredFaqs.map((faq, index) => {
                  const isExpanded = expandedFaqIndex === index;
                  return (
                    <div
                      key={index}
                      className="rounded-xl border border-[#303640] bg-[#161A20] overflow-hidden transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFaqIndex(isExpanded ? -1 : index)}
                        className="w-full flex items-center justify-between gap-4 p-4 text-left cursor-pointer hover:bg-[#1B2129]"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8B04A]/10 text-[#E8B04A] text-[11px] font-bold font-mono mt-0.5">
                            Q
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-[#F0F1F3]">
                            {faq.question}
                          </span>
                        </div>
                        <div className="text-[#A7AFBA] shrink-0">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 text-xs text-[#A7AFBA] leading-relaxed border-t border-[#303640]/50 ml-8">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════ TAB 2: BOOKING GUIDELINES ════════════════════ */}
          {activeTab === 'guidelines' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-sm font-bold text-[#F0F1F3] uppercase tracking-wider">
                  Indian Railways &amp; IRCTC Passenger Booking Guidelines
                </h3>
                <p className="text-xs text-[#A7AFBA] mt-0.5">
                  Commercial regulations, quota booking windows, ID verification, and connecting train rules.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Advance Reservation Period (ARP) */}
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[#E8B04A] font-bold text-xs uppercase tracking-wider">
                    <Calendar className="h-4 w-4" />
                    <span>Advance Reservation Period (ARP)</span>
                  </div>
                  <p className="text-xs text-[#A7AFBA] leading-relaxed">
                    General quota reservations open <strong>120 days</strong> in advance at <strong>08:00 AM IST</strong> daily (excluding date of journey). Charting is finalized 4 hours prior to train departure from the originating station.
                  </p>
                </div>

                {/* 2. Tatkal & Premium Tatkal Windows */}
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[#E8B04A] font-bold text-xs uppercase tracking-wider">
                    <Clock className="h-4 w-4" />
                    <span>Tatkal &amp; Premium Tatkal Timings</span>
                  </div>
                  <p className="text-xs text-[#A7AFBA] leading-relaxed">
                    Tatkal booking opens 1 day in advance: <strong>10:00 AM IST</strong> for AC Classes (1A, 2A, 3A, 3E, CC, EC) and <strong>11:00 AM IST</strong> for Non-AC Classes (SL, 2S). Maximum 4 passengers per Tatkal PNR.
                  </p>
                </div>

                {/* 3. Multi-Leg Connecting Train Protocol */}
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <Train className="h-4 w-4" />
                    <span>Multi-Leg Connecting Ticket Policy</span>
                  </div>
                  <p className="text-xs text-[#A7AFBA] leading-relaxed">
                    Multi-leg connecting plans require booking separate PNR tickets per leg. Yatrai enforces a minimum <strong>90-minute transfer layover</strong> at junctions to protect against rail delays. Separate tickets carry individual carriage liability.
                  </p>
                </div>

                {/* 4. Mandatory ID Proof for Travel */}
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <UserCheck className="h-4 w-4" />
                    <span>Mandatory Passenger Photo ID</span>
                  </div>
                  <p className="text-xs text-[#A7AFBA] leading-relaxed">
                    At least one passenger on every PNR must present an original government-issued photo ID during ticket checking: <strong>Aadhaar Card, Voter Card, Passport, Driving Licence, or PAN Card</strong>.
                  </p>
                </div>
              </div>

              {/* Regulatory Notice Banner */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 text-xs text-[#E8B04A] leading-relaxed">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[#E8B04A] mt-0.5" />
                <div>
                  <strong className="text-[#F0F1F3]">IRCTC Direct Regulatory Notice:</strong> Yatrai is an independent routing and itinerary optimization platform. All confirmed seat reservations, PNR generation, and payment processing must be completed through official IRCTC channels (irctc.co.in or PRS reservation counters).
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════ TAB 3: CANONICAL STATION CODES ════════════════════ */}
          {activeTab === 'stations' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F0F1F3] uppercase tracking-wider">
                    Canonical Railway Station Directory &amp; Sister Clusters
                  </h3>
                  <p className="text-xs text-[#A7AFBA] mt-0.5">
                    Search canonical IRCTC station codes, sister station clusters, and railway zones. Click any station to quick-fill your search.
                  </p>
                </div>

                {/* Search Station Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7E8794]" />
                  <input
                    type="text"
                    value={stationSearch}
                    onChange={(e) => setStationSearch(e.target.value)}
                    placeholder="Search code, city or state..."
                    className="w-full rounded-xl border border-[#303640] bg-[#181D24] pl-9 pr-3 py-1.5 text-xs text-[#F0F1F3] placeholder-[#7E8794] focus:outline-none focus:border-[#E8B04A]"
                  />
                  {stationSearch && (
                    <button
                      type="button"
                      onClick={() => setStationSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8794] hover:text-[#F0F1F3] text-xs cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Cluster Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                {clusters.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCluster(c)}
                    className={`px-3 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                      selectedCluster === c
                        ? 'bg-[#E8B04A] text-[#0B0D10] font-bold border-[#E8B04A]'
                        : 'border-[#303640] text-[#A7AFBA] hover:text-[#F0F1F3] bg-[#161A20]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Stations Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredStations.map((stn) => (
                  <div
                    key={stn.code}
                    className="rounded-xl border border-[#303640] bg-[#161A20] p-3.5 flex flex-col justify-between gap-3 hover:border-[#424A56] transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-black text-[#E8B04A] tracking-wider px-2 py-0.5 rounded bg-[#181D24] border border-[#303640]">
                          {stn.code}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#232830] text-[#A7AFBA]">
                          {stn.zone}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#F0F1F3] mt-2 group-hover:text-[#E8B04A] transition-colors">
                        {stn.name}
                      </div>
                      <div className="text-[11px] text-[#A7AFBA] mt-0.5">
                        {stn.city}, {stn.state} &middot; <span className="text-[#7E8794]">{stn.cluster}</span>
                      </div>
                    </div>

                    {/* Quick Selection Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#303640]/50 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectStation) onSelectStation(stn.code, `${stn.name} (${stn.code})`, 'origin');
                          onClose();
                        }}
                        className="flex-1 py-1 rounded-lg bg-[#1C222B] hover:bg-[#E8B04A] hover:text-[#0B0D10] text-[#A7AFBA] font-semibold transition-all cursor-pointer text-center"
                      >
                        Set as Origin
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectStation) onSelectStation(stn.code, `${stn.name} (${stn.code})`, 'destination');
                          onClose();
                        }}
                        className="flex-1 py-1 rounded-lg bg-[#1C222B] hover:bg-[#E8B04A] hover:text-[#0B0D10] text-[#A7AFBA] font-semibold transition-all cursor-pointer text-center"
                      >
                        Set as Dest.
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredStations.length === 0 && (
                <div className="p-8 text-center text-[#7E8794] text-xs">
                  No canonical stations matched &ldquo;{stationSearch}&rdquo;. Try searching city names like Delhi, Patna, Kolkata or codes like NDLS.
                </div>
              )}
            </div>
          )}

          {/* ════════════════════ TAB 4: PRIVACY POLICY ════════════════════ */}
          {activeTab === 'privacy' && (
            <div className="space-y-5 animate-in fade-in leading-relaxed text-xs text-[#A7AFBA]">
              <div>
                <h3 className="text-sm font-bold text-[#F0F1F3] uppercase tracking-wider">
                  Yatrai Platform Privacy Policy
                </h3>
                <p className="text-[11px] text-[#7E8794] mt-0.5">
                  Last updated: November 2026 &middot; Compliant with Digital Personal Data Protection (DPDP) Act, 2023.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">1. Information We Collect</h4>
                  <p>
                    Yatrai collects travel search queries (station origins, destinations, dates), passenger details entered during itinerary planning (names, ages, genders, berth preferences), and contact info (email and phone number) strictly for itinerary reservation record keeping and verification slip issuance.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400">2. Zero Payment &amp; Banking Credential Storage</h4>
                  <p>
                    Yatrai does <strong>not</strong> collect or store credit card numbers, debit cards, CVVs, net banking passwords, UPI PINs, or IRCTC account passwords. Official ticket payments and final booking verification occur strictly within authorized Indian Railways (IRCTC) payment gateways.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">3. Encryption &amp; Security Standards</h4>
                  <p>
                    All API communications occur over encrypted TLS/HTTPS connections. User authentication utilizes secure JSON Web Tokens (JWT) with rotating refresh tokens stored with SHA-256 cryptographic hashing to prevent session hijacking.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">4. Third-Party Service Providers</h4>
                  <p>
                    Live seat availability queries are resolved via secure RailKit PRS proxy adapters. Geographic location resolving utilizes OpenStreetMap Nominatim with strict rate limiting and compliant User-Agent headers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════ TAB 5: TERMS OF SERVICE ════════════════════ */}
          {activeTab === 'terms' && (
            <div className="space-y-5 animate-in fade-in leading-relaxed text-xs text-[#A7AFBA]">
              <div>
                <h3 className="text-sm font-bold text-[#F0F1F3] uppercase tracking-wider">
                  Terms of Service &amp; Rail Carriage Regulations
                </h3>
                <p className="text-[11px] text-[#7E8794] mt-0.5">
                  General terms of travel itinerary generation, handoff protocols, and passenger liability.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">1. Nature of the Service</h4>
                  <p>
                    Yatrai is an intelligent algorithmic railway journey discovery and recovery platform designed to compute optimal direct and multi-leg rail routes. Yatrai is not an authorized ticketing agent, ticket reseller, or representative of Indian Railways or IRCTC.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">2. Itinerary Summaries &amp; E-Ticket Slips</h4>
                  <p>
                    Reservation summaries and generated PDF slips issued by Yatrai reflect algorithmic route calculations. Confirmed seat reservations and official PNRs are finalized through Indian Railways PRS. Boarding without a valid IRCTC-confirmed ticket or original government photo ID is strictly prohibited under the Railways Act, 1989.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#E8B04A]">3. Multi-Leg Disconnections &amp; Delays</h4>
                  <p>
                    While Yatrai validates connecting layovers to 90–600 minutes to provide resilient transfer buffers, individual railway segments operate under separate contracts of carriage. Missed connections due to upstream train delays are subject to Indian Railways refund and TDR guidelines.
                  </p>
                </div>

                <div className="rounded-xl border border-[#303640] bg-[#161A20] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-[#F0F1F3]">4. Transparent Pricing &amp; Surcharges</h4>
                  <p>
                    Fare estimations are computed directly from Indian Railways distance charts for each class. Yatrai applies no hidden markup or unauthorized fee surcharges.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer Bar ── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-t border-[#303640] bg-[#15191F]/80 shrink-0 text-xs">
          <div className="flex items-center gap-2 text-[#7E8794]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E8B04A]" />
            <span>Yatrai Intelligence Platform</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] text-xs font-bold transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default HelpGuidanceModal;

