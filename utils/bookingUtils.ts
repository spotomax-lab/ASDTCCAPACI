import { doc, setDoc, increment, getDoc } from 'firebase/firestore';
import { db } from './config/firebase';

export const updateUserBookingCount = async (userId: string, operation: 'increment' | 'decrement' = 'increment') => {
  try {
    // ... (existing code for updateUserBookingCount)
  } catch (error) {
    console.error('Error updating booking count:', error);
  }
};

export const getUserBookingCount = async (userId: string) => {
  try {
    // ... (existing code for getUserBookingCount)
  } catch (error) {
    console.error('Error getting booking count:', error);
    return 0;
  }
};