// Lightweight data transfer module for swipe card navigation
// Avoids serializing large User arrays through React Navigation params

import { User } from "../types/dataModels";

interface SwipeCardData {
  users: User[];
  startIndex: number;
}

let pendingData: SwipeCardData | null = null;

export const setSwipeCardData = (users: User[], startIndex: number): void => {
  pendingData = { users, startIndex };
};

export const getSwipeCardData = (): SwipeCardData | null => {
  const data = pendingData;
  pendingData = null; // Clear after consumption
  return data;
};
