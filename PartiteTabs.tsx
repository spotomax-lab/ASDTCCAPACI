import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import MyBookingsScreen from './MyBookingsScreen';
import OpenMatchesScreen from './OpenMatchesScreen';

const Tab = createMaterialTopTabNavigator();

const PartiteTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarLabelStyle: { fontSize: 12, fontWeight: 'bold' },
        tabBarStyle: { backgroundColor: 'white' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: 'gray',
        tabBarIndicatorStyle: { backgroundColor: '#3b82f6' },
      }}
    >
      <Tab.Screen 
        name="LeMiePrenotazioni" 
        component={MyBookingsScreen}
        options={{
          title: 'Le Mie Prenotazioni',
        }}
      />
      <Tab.Screen 
        name="PartiteOpen" 
        component={OpenMatchesScreen}
        options={{
          title: 'Partite Open',
        }}
      />
    </Tab.Navigator>
  );
};

export default PartiteTabs;