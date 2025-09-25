// Script di migrazione aggiornato
import { db } from './migrateConfig.js';
import { collection, getDocs, doc, setDoc, deleteDoc, Timestamp, query, where } from 'firebase/firestore';

const migrateRecurringBlocks = async () => {
  try {
    console.log('🚀 Starting migration of recurring blocks...');
    
    // 1. Prendi tutti i blocchi esistenti
    const blocksSnapshot = await getDocs(collection(db, 'blockedSlots'));
    console.log(`📋 Found ${blocksSnapshot.size} blocks to process`);
    
    // 2. Filtra quelli ricorrenti
    const recurringBlocks = [];
    blocksSnapshot.forEach(doc => {
      const data = doc.data();
      const blockTitle = data.title || '';
      
      // Identifica i blocchi ricorrenti in base al titolo
      if (blockTitle.includes('Scuola') || 
          blockTitle.includes('Lezione') || 
          blockTitle.includes('Manutenzione') ||
          blockTitle.includes('Corso') ||
          blockTitle.includes('Allenamento')) {
        recurringBlocks.push({ 
          id: doc.id, 
          ...data,
          title: blockTitle
        });
      }
    });
    
    console.log(`🔄 Found ${recurringBlocks.length} recurring blocks to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    // 3. Converti in configurazioni slot
    for (const block of recurringBlocks) {
      try {
        console.log(`⏳ Processing block: ${block.title}`);
        
        const startDate = block.start?.toDate ? block.start.toDate() : new Date(block.start);
        const dayOfWeek = startDate.getDay(); // 0 = Domenica, 1 = Lunedì, etc.
        const courtId = block.courtId || '1'; // Default a Campo 1 se non specificato
        
        // Calcola la durata in minuti
        const endDate = block.end?.toDate ? block.end.toDate() : new Date(block.end);
        const durationMs = endDate.getTime() - startDate.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        // Formatta gli orari
        const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
        const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        
        // Determina il tipo di attività in base al titolo
        let activityType = 'regular';
        if (block.type === 'school' || block.title.includes('Scuola')) activityType = 'school';
        if (block.type === 'individual' || block.title.includes('Lezione')) activityType = 'individual';
        if (block.type === 'blocked' || block.title.includes('Manutenzione')) activityType = 'blocked';
        
        // Crea un ID unico per questa configurazione
        const configId = `${courtId}_${dayOfWeek}_${startTime.replace(':', '')}`;
        
        // Crea configurazione slot
        await setDoc(doc(db, 'slotConfigurations', configId), {
          courtId: courtId,
          dayOfWeek: dayOfWeek,
          startTime: startTime,
          endTime: endTime,
          slotDuration: durationMinutes,
          activityType: activityType,
          isActive: true,
          notes: block.title || 'Migrato da blocco manuale',
          createdAt: Timestamp.now(),
          migratedFrom: block.id,
          originalDate: block.start
        });
        
        // Elimina il blocco originale
        await deleteDoc(doc(db, 'blockedSlots', block.id));
        
        migratedCount++;
        console.log(`✅ Migrated: ${block.title} -> Campo ${courtId}, Giorno ${dayOfWeek}, ${startTime}-${endTime}`);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating block ${block.id}:`, error.message);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} blocks`);
    console.log(`❌ Errors: ${errorCount} blocks`);
    console.log(`📝 Total processed: ${recurringBlocks.length} blocks`);
    
  } catch (error) {
    console.error('💥 Error in migration process:', error);
  }
};

// Esegui la migrazione
migrateRecurringBlocks().then(() => {
  console.log('🎉 Migration process completed!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});