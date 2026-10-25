import React, { useState, useEffect, useId } from 'react';
import {
  Ticket,
  User,
  Users,
  Calendar,
  Clock,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  ChevronLeft,
  Plus,
  Trash2,
  Shield,
  Loader2,
  Train,
  CreditCard,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import TicketModal from '../components/booking/TicketModal.jsx';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatDayOffsetBadge,
  getDayOffset,
} from '../utils/formatters.js';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const BERTH_OPTIONS = [
  { value: 'no_preference', label: 'No Preference' },
  { value: 'lower', label: 'Lower Berth' },
  { value: 'middle', label: 'Middle Berth' },
  { value: 'upper', label: 'Upper Berth' },
  { value: 'side_lower', label: 'Side Lower' },
  { value: 'side_upper', label: 'Side Upper' },
  { value: 'window', label: 'Window Seat' },
];

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'senior_citizen', label: 'Senior Citizen' },
  { value: 'child', label: 'Child (5-11 yrs)' },
  { value: 'divyang', label: 'Divyang' },
];

export function BookingPage({ onNavigate, onNavigateHome }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Wizard Step: 1 = Passengers, 2 = Review, 3 = Processing, 4 = Result
  const [currentStep, setCurrentStep] = useState(1);

  // Recovery & Journey State
  const [loadingJourney, setLoadingJourney] = useState(true);
  const [journeyError, setJourneyError] = useState(null);
  const [journeyData, setJourneyData] = useState(null);

  // Form State
  const [passengers, setPassengers] = useState([
    {
      name: '',
      age: '',
      gender: 'male',
      berthPreference: 'no_preference',
      category: 'general',
    },
  ]);
  const [contactInfo, setContactInfo] = useState({
    email: '',
    phone: '',
  });
  const [errors, setErrors] = useState({});

  // Submission & Result State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

  // 1. Initial Authentication Check & Journey Recovery (Section 2)
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      if (onNavigate) {
        onNavigate('/profile');
      } else {
        window.history.pushState(null, '', '/profile');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return;
    }

    const recoverJourney = async () => {
      setLoadingJourney(true);
      setJourneyError(null);

      try {
        // Step 1: Check URL search params for journeyId
        const params = new URLSearchParams(window.location.search);
        let journeyId = params.get('journeyId') || params.get('id');

        // Step 2: Check sessionStorage and localStorage fallbacks
        let sessionSnapshot = null;
        const pendingRaw =
          sessionStorage.getItem('yatrai_pending_booking') ||
          localStorage.getItem('yatrai_last_selected_journey');

        if (pendingRaw) {
          try {
            const parsed = JSON.parse(pendingRaw);
            if (!journeyId && parsed.journeyId) {
              journeyId = parsed.journeyId;
            }
            if (parsed.journeySnapshot) {
              sessionSnapshot = parsed.journeySnapshot;
            }
          } catch {
            // ignore JSON error
          }
        }

        // Step 3: Fetch latest persisted journey from backend ONLY if journeyId is a valid 24-char MongoDB ObjectId
        let authoritativeJourney = null;
        const isMongoObjectId = journeyId && /^[0-9a-fA-F]{24}$/.test(journeyId);
        if (isMongoObjectId) {
          try {
            const res = await api.journeys.getById(journeyId);
            if (res?.data?.journey) {
              authoritativeJourney = res.data.journey;
            }
          } catch (fetchErr) {
            console.warn('[BookingPage] Failed to fetch persisted journey from backend:', fetchErr.message);
          }
        }

        const activeJourney = authoritativeJourney || sessionSnapshot;

        if (!activeJourney) {
          throw new Error(
            'Unable to recover your selected journey. Your search session may have expired. Please perform a fresh search.'
          );
        }

        // Normalize activeJourney attributes safely so all steps can read them
        const legs = Array.isArray(activeJourney.legs) ? activeJourney.legs : [];
        const originCode =
          activeJourney.origin?.code ||
          activeJourney.fromCode ||
          activeJourney.from ||
          activeJourney.originStation?.code ||
          legs[0]?.origin?.code ||
          legs[0]?.fromCode ||
          legs[0]?.from ||
          'ORIGIN';
        const originName =
          activeJourney.origin?.name ||
          activeJourney.originStation?.name ||
          activeJourney.from ||
          originCode;

        const lastLeg = legs[legs.length - 1];
        const destCode =
          activeJourney.destination?.code ||
          activeJourney.toCode ||
          activeJourney.to ||
          activeJourney.destinationStation?.code ||
          lastLeg?.destination?.code ||
          lastLeg?.toCode ||
          lastLeg?.to ||
          'DEST';
        const destName =
          activeJourney.destination?.name ||
          activeJourney.destinationStation?.name ||
          activeJourney.to ||
          destCode;

        const calculatedFare =
          Number(activeJourney.totalPrice) > 0
            ? Number(activeJourney.totalPrice)
            : Number(activeJourney.totalFare) > 0
            ? Number(activeJourney.totalFare)
            : Number(activeJourney.fare) > 0
            ? Number(activeJourney.fare)
            : 380;

        const normalizedJourney = {
          ...activeJourney,
          id: activeJourney.id || activeJourney._id || journeyId || `j-${Date.now()}`,
          origin: {
            code: originCode,
            name: originName,
          },
          destination: {
            code: destCode,
            name: destName,
          },
          totalPrice: calculatedFare,
          totalFare: calculatedFare,
          fare: calculatedFare,
          duration:
            activeJourney.duration ||
            activeJourney.totalDuration ||
            activeJourney.totalDurationMinutes ||
            0,
          departureTime: activeJourney.departureTime || legs[0]?.departureTime || '00:00',
          arrivalTime: activeJourney.arrivalTime || lastLeg?.arrivalTime || '00:00',
          departureDate:
            activeJourney.departureDate ||
            activeJourney.departureTime ||
            legs[0]?.departureDate,
          arrivalDate:
            activeJourney.arrivalDate ||
            activeJourney.arrivalTime ||
            lastLeg?.arrivalDate,
          numberOfTransfers:
            activeJourney.numberOfTransfers !== undefined
              ? activeJourney.numberOfTransfers
              : legs.length > 1
              ? legs.length - 1
              : 0,
          legs,
        };

        setJourneyData(normalizedJourney);

        // Pre-fill contact details from authenticated user
        if (user) {
          setContactInfo((prev) => ({
            email: prev.email || user.email || '',
            phone: prev.phone || user.phone || '',
          }));
        }
      } catch (err) {
        setJourneyError(err.message || 'Failed to load journey details.');
      } finally {
        setLoadingJourney(false);
      }
    };

    recoverJourney();
  }, [isAuthenticated, authLoading, user, onNavigate]);

  // Handle passenger input changes
  const handlePassengerChange = (index, field, value) => {
    setPassengers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

    if (errors[`passenger_${index}_${field}`]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[`passenger_${index}_${field}`];
        return copy;
      });
    }
  };

  const addPassenger = () => {
    if (passengers.length >= 6) return;
    setPassengers((prev) => [
      ...prev,
      {
        name: '',
        age: '',
        gender: 'male',
        berthPreference: 'no_preference',
        category: 'general',
      },
    ]);
  };

  const removePassenger = (index) => {
    if (passengers.length <= 1) return;
    setPassengers((prev) => prev.filter((_, i) => i !== index));
  };

  // Validate Passenger Details (Section 3)
  const validateForm = () => {
    const newErrors = {};

    // Validate Contact
    if (!contactInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo.email.trim())) {
      newErrors.email = 'Please provide a valid email address for ticket notifications.';
    }
    if (!contactInfo.phone || contactInfo.phone.trim().length < 8) {
      newErrors.phone = 'Please provide a valid phone number (at least 8 digits).';
    }

    // Validate Passengers
    passengers.forEach((p, idx) => {
      if (!p.name || p.name.trim().length < 2) {
        newErrors[`passenger_${idx}_name`] = 'Full name must be at least 2 characters.';
      }
      const ageNum = Number(p.age);
      if (!p.age || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
        newErrors[`passenger_${idx}_age`] = 'Age must be between 1 and 120.';
      }
      if (!['male', 'female', 'other'].includes(p.gender)) {
        newErrors[`passenger_${idx}_gender`] = 'Select a valid gender.';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToReview = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle Book Ticket submission (Section 4)
  const handleBookTicket = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setCurrentStep(3); // Show processing screen

    try {
      const journeyId = journeyData.id || journeyData._id;

      const payload = {
        journeyId,
        journeySnapshot: journeyData,
        passengerDetails: passengers.map((p) => ({
          name: p.name.trim(),
          age: Number(p.age),
          gender: p.gender,
          berthPreference: p.berthPreference,
          category: p.category,
        })),
        contactInfo: {
          email: contactInfo.email.trim(),
          phone: contactInfo.phone.trim(),
        },
        idempotencyKey,
      };

      const res = await api.booking.create(payload);

      if (res?.data?.booking) {
        setBookingResult(res.data.booking);
        // Clear pending booking from sessionStorage
        sessionStorage.removeItem('yatrai_pending_booking');
        setCurrentStep(4); // Move to Result step
      } else {
        throw new Error('Booking could not be recorded. Please try again.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Booking submission failed. Please check your network and try again.');
      setCurrentStep(2); // Return to review so user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle PDF Download (Section 5)
  const handleDownloadPdf = async () => {
    if (!bookingResult?._id || downloadingPdf) return;

    setDownloadingPdf(true);
    try {
      await api.booking.downloadPdf(bookingResult._id, bookingResult.bookingReference);
    } catch (err) {
      alert(`PDF download failed: ${err.message}. Please retry.`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Loading Screen
  if (authLoading || loadingJourney) {
    return (
      <div className="mx-auto max-w-4xl py-16 px-4">
        <div className="rounded-2xl border border-white/10 bg-surface-primary p-8 text-center space-y-4 shadow-xl">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-primary" />
          <h2 className="text-base font-bold text-text-primary">Loading Booking Details...</h2>
          <p className="text-xs text-text-secondary">
            Retrieving verified journey itinerary and current seat availability.
          </p>
        </div>
      </div>
    );
  }

  // Error Recovery Screen
  if (journeyError || !journeyData) {
    return (
      <div className="mx-auto max-w-xl py-16 px-4">
        <div className="rounded-2xl border border-red-500/20 bg-surface-primary p-8 text-center space-y-5 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-text-primary">Unable to Recover Journey</h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              {journeyError || 'The selected journey could not be recovered or has expired from your search session.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const lastSearch = sessionStorage.getItem('yatrai_last_search_url');
                if (lastSearch && onNavigate) {
                  onNavigate(lastSearch);
                } else if (window.history.length > 1) {
                  window.history.back();
                } else if (onNavigate) {
                  onNavigate('/results');
                } else {
                  window.location.href = '/results';
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-brand-hover transition-all cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Return to Search Results</span>
            </button>
            <button
              type="button"
              onClick={() => (onNavigateHome ? onNavigateHome() : (window.location.href = '/'))}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <span>Start New Search</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract Journey Info for Display
  const legs = Array.isArray(journeyData.legs) ? journeyData.legs : [];
  const originName = journeyData.origin?.name || journeyData.origin?.city || 'Origin';
  const destName = journeyData.destination?.name || journeyData.destination?.city || 'Destination';
  const originCode = journeyData.origin?.code ? `[${journeyData.origin.code}]` : '';
  const destCode = journeyData.destination?.code ? `[${journeyData.destination.code}]` : '';

  const depTime = formatTime(journeyData.departureTime || legs[0]?.departureTime);
  const arrTime = formatTime(journeyData.arrivalTime || legs[legs.length - 1]?.arrivalTime);
  const depDate = formatDateDisplay(
    journeyData.departureDate || journeyData.departureTime || legs[0]?.departureDate
  );
  const arrDate = formatDateDisplay(
    journeyData.arrivalDate || journeyData.arrivalTime || legs[legs.length - 1]?.arrivalDate
  );
  const dayOffset = getDayOffset(
    journeyData.departureTime || legs[0]?.departureTime,
    journeyData.arrivalTime || legs[legs.length - 1]?.arrivalTime
  );
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const durationStr = formatDuration(journeyData.duration);
  const transfers = journeyData.numberOfTransfers || 0;
  const isDirect = transfers === 0 && legs.length <= 1;

  const basePricePerPerson = Number(journeyData.totalPrice) > 0 ? Number(journeyData.totalPrice) : 380;
  const totalCalculatedFare = basePricePerPerson * passengers.length;

  const trainName =
    legs.length > 1
      ? legs.map((l) => l.service?.name || l.trainName).filter(Boolean).join(' → ') ||
        'Connecting Rail Service'
      : legs[0]?.service?.name ||
        legs[0]?.trainName ||
        journeyData.metadata?.trainName ||
        'Train Service';

  const trainNumber =
    legs.length > 1
      ? legs.map((l) => l.service?.number || l.trainNumber || l.trainNo).filter(Boolean).join(' / ')
      : legs[0]?.vehicle?.identifier ||
        legs[0]?.service?.number ||
        legs[0]?.trainNumber ||
        legs[0]?.trainNo ||
        journeyData.metadata?.trainNumber ||
        '';

  const travelClass =
    legs[0]?.service?.class || legs[0]?.class || journeyData.laneClass || '3A';

  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-10 px-4 space-y-8">
      {/* 1. Header & Step Indicator (Section 8) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (currentStep === 2) {
                setCurrentStep(1);
              } else {
                const lastSearch = sessionStorage.getItem('yatrai_last_search_url');
                if (lastSearch && onNavigate) {
                  onNavigate(lastSearch);
                } else if (window.history.length > 1) {
                  window.history.back();
                } else if (onNavigate) {
                  onNavigate('/results');
                } else {
                  window.location.href = '/results';
                }
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{currentStep === 2 ? 'Back to Passenger Details' : 'Back to Results'}</span>
          </button>
          <span className="text-xs font-mono text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-1 rounded-full">
            Step {currentStep} of 4
          </span>
        </div>

        {/* Step Tabs Indicator */}
        <div className="grid grid-cols-4 gap-2 border-b border-white/10 pb-4 text-xs font-semibold">
          <div
            className={`flex items-center gap-2 pb-1 border-b-2 transition-all ${
              currentStep === 1
                ? 'border-brand-primary text-brand-primary'
                : currentStep > 1
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-text-tertiary'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px]">
              {currentStep > 1 ? '✓' : '1'}
            </span>
            <span className="hidden sm:inline">1. Passenger Details</span>
            <span className="sm:hidden">Passengers</span>
          </div>

          <div
            className={`flex items-center gap-2 pb-1 border-b-2 transition-all ${
              currentStep === 2
                ? 'border-brand-primary text-brand-primary'
                : currentStep > 2
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-text-tertiary'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px]">
              {currentStep > 2 ? '✓' : '2'}
            </span>
            <span className="hidden sm:inline">2. Review Journey</span>
            <span className="sm:hidden">Review</span>
          </div>

          <div
            className={`flex items-center gap-2 pb-1 border-b-2 transition-all ${
              currentStep === 3
                ? 'border-brand-primary text-brand-primary'
                : currentStep > 3
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-text-tertiary'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px]">
              {currentStep > 3 ? '✓' : '3'}
            </span>
            <span className="hidden sm:inline">3. Processing</span>
            <span className="sm:hidden">Processing</span>
          </div>

          <div
            className={`flex items-center gap-2 pb-1 border-b-2 transition-all ${
              currentStep === 4
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-tertiary'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px]">
              4
            </span>
            <span className="hidden sm:inline">4. Booking Result</span>
            <span className="sm:hidden">Result</span>
          </div>
        </div>
      </div>

      {/* 2. Read-Only Journey Summary Card (Always Visible for Context) */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              <Train className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-text-primary">{trainName}</span>
                {trainNumber && (
                  <span className="text-xs font-mono font-semibold text-text-secondary bg-white/5 px-2 py-0.5 rounded">
                    #{trainNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                Class: <strong className="text-text-primary">{travelClass}</strong> · Quota: General (GN)
              </p>
            </div>
          </div>

          <div className="text-right sm:text-right">
            <span className="text-[11px] text-text-tertiary uppercase font-semibold">Estimated Fare</span>
            <div className="text-lg font-bold font-mono text-emerald-400">
              {formatPrice(totalCalculatedFare)}
            </div>
            <span className="text-[10px] text-text-secondary">
              ({formatPrice(basePricePerPerson)} × {passengers.length} traveller{passengers.length > 1 ? 's' : ''})
            </span>
          </div>
        </div>

        {/* Corridor Timings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center text-xs">
          <div>
            <div className="text-text-tertiary text-[11px] font-semibold uppercase">From Station</div>
            <div className="font-bold text-text-primary text-sm mt-0.5">
              {originName} {originCode}
            </div>
            <div className="text-text-secondary mt-0.5 font-mono">
              {depTime} IST · {depDate}
            </div>
          </div>

          <div className="text-center sm:border-x border-white/10 sm:px-4 py-1">
            <div className="text-text-tertiary text-[11px] font-semibold uppercase">Duration</div>
            <div className="font-bold text-brand-primary mt-0.5">{durationStr}</div>
            <div className="text-[11px] text-text-secondary mt-0.5">
              {isDirect ? 'Direct Train' : `${transfers} transit transfer`}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-text-tertiary text-[11px] font-semibold uppercase">To Station</div>
            <div className="font-bold text-text-primary text-sm mt-0.5">
              {destName} {destCode}
            </div>
            <div className="text-text-secondary mt-0.5 font-mono flex sm:justify-end items-center gap-1.5">
              <span>{arrTime} IST · {arrDate}</span>
              {dayOffsetBadge && (
                <span className="rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-bold text-amber-400 border border-amber-500/20">
                  {dayOffsetBadge}
                </span>
              )}
            </div>
          </div>
        </div>

        {legs.length > 1 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Multi-Leg Connecting Journey:</span> This itinerary includes {legs.length} train legs (Transfer at {legs[0]?.toCode || legs[0]?.to || 'intermediate junction'}). In accordance with IRCTC ticketing regulations, each train leg must be booked as a separate ticket.
            </div>
          </div>
        )}
      </div>

      {/* 3. STEP 1: PASSENGER DETAILS FORM */}
      {currentStep === 1 && (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          {/* Primary Contact Details */}
          <div className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
              <User className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                Primary Contact Information
              </h3>
            </div>
            <p className="text-xs text-text-secondary">
              Booking notifications and your Journey Summary document will be delivered to these contact details.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contactInfo.email}
                  onChange={(e) => setContactInfo((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. traveler@example.com"
                  className={`w-full rounded-xl border bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary focus:outline-none transition-colors ${
                    errors.email ? 'border-red-500/80 focus:border-red-500' : 'border-white/10 focus:border-brand-primary'
                  }`}
                />
                {errors.email && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Mobile Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={contactInfo.phone}
                  onChange={(e) => setContactInfo((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. 9876543210"
                  className={`w-full rounded-xl border bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary focus:outline-none transition-colors ${
                    errors.phone ? 'border-red-500/80 focus:border-red-500' : 'border-white/10 focus:border-brand-primary'
                  }`}
                />
                {errors.phone && <p className="text-[11px] text-red-400 mt-1">{errors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Repeatable Passenger Cards (Section 3) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-primary" />
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                  Traveller Details ({passengers.length} of 6)
                </h3>
              </div>

              {passengers.length < 6 && (
                <button
                  type="button"
                  onClick={addPassenger}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Another Traveller</span>
                </button>
              )}
            </div>

            {passengers.map((passenger, index) => (
              <div
                key={index}
                className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-4 relative"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                    Passenger #{index + 1}
                  </span>

                  {passengers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePassenger(index)}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  {/* Full Name */}
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Full Name (as on Govt ID) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={passenger.name}
                      onChange={(e) => handlePassengerChange(index, 'name', e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className={`w-full rounded-xl border bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary focus:outline-none transition-colors ${
                        errors[`passenger_${index}_name`]
                          ? 'border-red-500/80 focus:border-red-500'
                          : 'border-white/10 focus:border-brand-primary'
                      }`}
                    />
                    {errors[`passenger_${index}_name`] && (
                      <p className="text-[11px] text-red-400 mt-1">{errors[`passenger_${index}_name`]}</p>
                    )}
                  </div>

                  {/* Age */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Age <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={passenger.age}
                      onChange={(e) => handlePassengerChange(index, 'age', e.target.value)}
                      placeholder="e.g. 32"
                      className={`w-full rounded-xl border bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary focus:outline-none transition-colors ${
                        errors[`passenger_${index}_age`]
                          ? 'border-red-500/80 focus:border-red-500'
                          : 'border-white/10 focus:border-brand-primary'
                      }`}
                    />
                    {errors[`passenger_${index}_age`] && (
                      <p className="text-[11px] text-red-400 mt-1">{errors[`passenger_${index}_age`]}</p>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Gender <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={passenger.gender}
                      onChange={(e) => handlePassengerChange(index, 'gender', e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
                    >
                      {GENDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-surface-primary text-text-primary">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Berth Preference */}
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Berth Preference
                    </label>
                    <select
                      value={passenger.berthPreference}
                      onChange={(e) => handlePassengerChange(index, 'berthPreference', e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
                    >
                      {BERTH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-surface-primary text-text-primary">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate('/results') : window.history.back())}
              className="text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Cancel & Modify Search
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-xs font-bold text-white shadow-lg hover:bg-brand-hover active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Review Journey & Travellers</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {/* 4. STEP 2: REVIEW JOURNEY & CONFIRMATION */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider border-b border-white/10 pb-3">
              Review Itinerary & Travellers
            </h3>

            {/* Passenger List Summary Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-text-tertiary">
                    <th className="py-2">#</th>
                    <th className="py-2">Traveller Name</th>
                    <th className="py-2">Age</th>
                    <th className="py-2">Gender</th>
                    <th className="py-2">Berth Choice</th>
                    <th className="py-2">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {passengers.map((p, i) => (
                    <tr key={i} className="text-text-primary">
                      <td className="py-2.5 font-bold text-brand-primary">{i + 1}</td>
                      <td className="py-2.5 font-semibold">{p.name}</td>
                      <td className="py-2.5 text-text-secondary">{p.age} yrs</td>
                      <td className="py-2.5 text-text-secondary capitalize">{p.gender}</td>
                      <td className="py-2.5 text-text-secondary capitalize">
                        {p.berthPreference.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 text-text-secondary capitalize">
                        {p.category.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Contact review */}
            <div className="flex flex-wrap items-center gap-6 rounded-xl border border-white/5 bg-surface-secondary/60 p-3 text-xs text-text-secondary">
              <div>
                Email: <strong className="text-text-primary">{contactInfo.email}</strong>
              </div>
              <div>
                Phone: <strong className="text-text-primary">{contactInfo.phone}</strong>
              </div>
            </div>
          </div>

          {/* Fare Summary Breakdown */}
          <div className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider border-b border-white/10 pb-3">
              Fare & Charges Breakdown
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Base Journey Fare ({passengers.length} × {formatPrice(basePricePerPerson)}):</span>
                <span className="font-mono text-text-primary">{formatPrice(totalCalculatedFare)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>IRCTC & Partner Convenience Surcharge:</span>
                <span className="font-mono text-emerald-400">₹0 (Transparent)</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-bold text-text-primary">
                <span>Estimated Total Fare:</span>
                <span className="font-mono text-base text-emerald-400">{formatPrice(totalCalculatedFare)}</span>
              </div>
            </div>
          </div>

          {/* Compliance & Limitation Notice (Section 4 Critical Integrity Rule) */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>IRCTC & Indian Railways Booking Regulatory Notice</span>
            </div>
            <p className="leading-relaxed">
              Yatrai organizes optimized travel routes and prepares your complete itinerary summary. Per Indian Railways regulations, direct railway reservations and confirmed PNR issuance must be finalized via authorized IRCTC channels. Yatrai records your verified journey details and issues a downloadable Journey Summary document for booking handoff.
            </p>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Edit Passenger Details</span>
            </button>

            <button
              type="button"
              id="confirm-book-ticket-btn"
              onClick={handleBookTicket}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-7 py-3.5 text-xs font-bold text-white shadow-xl hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Recording Booking...</span>
                </>
              ) : (
                <>
                  <Ticket className="h-4 w-4" />
                  <span>Book Ticket</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 5. STEP 3: PROCESSING STATE */}
      {currentStep === 3 && (
        <div className="rounded-2xl border border-white/10 bg-surface-primary p-12 text-center space-y-5 shadow-2xl">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin" />
            <Train className="h-7 w-7 text-brand-primary" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-text-primary">Preparing Your Journey Summary...</h3>
            <p className="text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
              Verifying train schedules with Indian Railways, recording passenger details, and formatting your official Yatrai summary document.
            </p>
          </div>
        </div>
      )}

      {/* 6. STEP 4: BOOKING RESULT SCREEN (Section 4 & 5) */}
      {currentStep === 4 && bookingResult && (
        <div className="space-y-6 animate-in fade-in">
          {/* Result Banner */}
          <div className="rounded-2xl border border-amber-500/20 bg-surface-primary p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Ticket className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  Journey Summary Created (Handoff Required)
                </span>
                <h2 className="text-lg font-bold text-text-primary mt-1">
                  Booking Recorded · {bookingResult.bookingReference}
                </h2>
                {bookingResult.pnr && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-tertiary">Yatrai PNR:</span>
                    <span className="font-mono text-base font-black text-[#E8B04A] tracking-wider">
                      {bookingResult.pnr}
                    </span>
                    <span className="text-[10px] text-text-tertiary">(use this for PNR Status check)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Regulatory Notice Banner */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-relaxed">
              <strong className="block text-amber-100 mb-1">Notice: Not an Official Railway Ticket</strong>
              Per Indian Railways (IRCTC) regulations and direct integration policies, this itinerary summary does not confirm seat reservation and cannot be used to board trains. Download your PDF summary below or continue to IRCTC to complete your seat reservation with these verified train details.
            </div>

            {/* Quick Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/10 pt-4 text-xs">
              {bookingResult.pnr && (
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-text-tertiary uppercase text-[10px] font-semibold">Yatrai PNR</span>
                  <div className="font-mono font-black text-[#E8B04A] text-base tracking-wider">{bookingResult.pnr}</div>
                </div>
              )}
              <div>
                <span className="text-text-tertiary uppercase text-[10px] font-semibold">Booking Ref</span>
                <div className="font-mono font-bold text-brand-primary text-[11px]">{bookingResult.bookingReference}</div>
              </div>
              <div>
                <span className="text-text-tertiary uppercase text-[10px] font-semibold">Train Service</span>
                <div className="font-bold text-text-primary">{trainName} (#{trainNumber})</div>
              </div>
              <div>
                <span className="text-text-tertiary uppercase text-[10px] font-semibold">Travellers</span>
                <div className="font-bold text-text-primary">{bookingResult.passengerDetails?.length || passengers.length} Person(s)</div>
              </div>
              <div>
                <span className="text-text-tertiary uppercase text-[10px] font-semibold">Total Fare</span>
                <div className="font-mono font-bold text-emerald-400">{formatPrice(bookingResult.fare?.totalFare || totalCalculatedFare)}</div>
              </div>
            </div>

            {/* Primary Action Buttons (Section 5) */}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowTicketModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-xs font-bold text-white shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Ticket className="h-4 w-4 text-amber-300" />
                <span>View Official E-Ticket</span>
              </button>

              <button
                type="button"
                id="download-ticket-pdf-btn"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-xs font-bold text-white shadow-lg hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
              >
                {downloadingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating E-Ticket...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Download E-Ticket (PDF)</span>
                  </>
                )}
              </button>

              <a
                href="https://www.irctc.co.in/nget/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-5 py-3 text-xs font-bold text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                <span>Continue to IRCTC</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('/bookings')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span>View in My Bookings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive E-Ticket Modal Preview */}
      {showTicketModal && bookingResult && (
        <TicketModal
          booking={bookingResult}
          onClose={() => setShowTicketModal(false)}
          onDownload={handleDownloadPdf}
          isDownloading={downloadingPdf}
        />
      )}
    </div>
  );
}

export default BookingPage;
