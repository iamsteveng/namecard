import { useNavigate } from 'react-router-dom';
import ScanWorkflow from '../components/scan/ScanWorkflow';
import type { Card } from '@namecard/shared/types/card.types';

export default function Scan() {
  const navigate = useNavigate();

  const handleScanComplete = (card: Card) => {
    // Navigate to the cards page after successful scan
    navigate('/cards', { 
      state: { 
        message: `Successfully saved ${card.name ? card.name + "'s" : 'business'} card!`,
        newCardId: card.id 
      } 
    });
  };

  const handleCancel = () => {
    // Navigate back to dashboard
    navigate('/dashboard');
  };

  return (
    <ScanWorkflow 
      onComplete={handleScanComplete}
      onCancel={handleCancel}
    />
  );
}
