import React, { useState } from 'react';
import { useSubmitFeedback } from "@workspace/api-client-react";
import { Star, Share2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../hooks/use-toast';

interface FeedbackModalProps {
  sessionId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ sessionId, isOpen, onClose }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const { mutate: submitFeedback, isPending } = useSubmitFeedback();
  const { toast } = useToast();

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied!",
      description: "Share RespiraLoop with your friends.",
    });
  };

  const handleSubmit = () => {
    if (rating === 0 || recommend === null) {
      toast({
        title: "Incomplete",
        description: "Please provide both rating and recommendation.",
        variant: "destructive"
      });
      return;
    }

    submitFeedback({ 
      data: { sessionId, ratingHelpful: rating, wouldRecommend: recommend } 
    }, {
      onSuccess: () => {
        toast({
          title: "Thank you!",
          description: "Your feedback helps us improve.",
        });
        onClose();
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Could not submit feedback. Please try again.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel w-full max-w-md p-8 rounded-3xl relative"
            >
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold font-display mb-2">Session Complete</h2>
                <p className="text-muted-foreground">How did this breathing exercise feel?</p>
              </div>

              <div className="space-y-8">
                <div className="flex flex-col items-center">
                  <label className="text-sm font-medium mb-3 uppercase tracking-wider text-muted-foreground">
                    Was this helpful?
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={`p-2 transition-all ${rating >= star ? 'text-yellow-400 scale-110 drop-shadow-md' : 'text-muted-foreground hover:text-yellow-400/50 hover:scale-105'}`}
                      >
                        <Star className="w-8 h-8" fill={rating >= star ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <label className="text-sm font-medium mb-3 uppercase tracking-wider text-muted-foreground">
                    Would you recommend it?
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setRecommend(true)}
                      className={`px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-all ${recommend === true ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white/5 text-foreground hover:bg-white/10 border border-white/10'}`}
                    >
                      <Check className="w-5 h-5" /> Yes
                    </button>
                    <button
                      onClick={() => setRecommend(false)}
                      className={`px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-all ${recommend === false ? 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20' : 'bg-white/5 text-foreground hover:bg-white/10 border border-white/10'}`}
                    >
                      <X className="w-5 h-5" /> No
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleSubmit}
                    disabled={isPending || rating === 0 || recommend === null}
                    className="flex-1 bg-white text-background py-4 rounded-xl font-bold text-lg hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isPending ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center justify-center p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors text-foreground"
                    title="Share with friends"
                  >
                    <Share2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
