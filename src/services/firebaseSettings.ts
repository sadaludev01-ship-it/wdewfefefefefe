// Firebase settings service for real-time configuration sync
import { ref, set, get, onValue, off, DatabaseReference, DataSnapshot } from 'firebase/database';
import { database } from '../config/firebase';
import { AppConfig, FirebaseSettings, PersonalityProfile } from '../types';
import { DEFAULT_CONFIG } from '../config/constants';

const SETTINGS_PATH = 'buddy-voice-settings';
const PROFILES_PATH = 'personality-profiles';

class FirebaseSettingsService {
  private settingsRef: DatabaseReference;
  private profilesRef: DatabaseReference;
  private listeners: Array<() => void> = [];

  constructor() {
    this.settingsRef = ref(database, SETTINGS_PATH);
    this.profilesRef = ref(database, PROFILES_PATH);
  }

  /**
   * Save settings to Firebase
   */
  async saveSettings(config: AppConfig, updatedBy: string = 'dev-console'): Promise<void> {
    try {
      const firebaseSettings: FirebaseSettings = {
        ...config,
        lastUpdated: Date.now(),
        updatedBy
      };
      await set(this.settingsRef, firebaseSettings);
      console.log('Settings saved to Firebase:', firebaseSettings);
    } catch (error) {
      console.error('Error saving settings to Firebase:', error);
      throw error;
    }
  }

  /**
   * Load settings from Firebase
   */
  async loadSettings(): Promise<AppConfig> {
    try {
      const snapshot = await get(this.settingsRef);
      if (snapshot.exists()) {
        const firebaseSettings = snapshot.val() as FirebaseSettings;
        // Remove Firebase-specific fields and return AppConfig
        const { lastUpdated, updatedBy, ...appConfig } = firebaseSettings;
        console.log('Settings loaded from Firebase:', appConfig);
        return appConfig;
      } else {
        console.log('No settings found in Firebase, using defaults');
        // Initialize with default config
        await this.saveSettings(DEFAULT_CONFIG, 'initialization');
        return DEFAULT_CONFIG;
      }
    } catch (error) {
      console.error('Error loading settings from Firebase:', error);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Subscribe to real-time settings updates
   */
  subscribeToSettings(callback: (config: AppConfig) => void): () => void {
    const unsubscribe = onValue(this.settingsRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        const firebaseSettings = snapshot.val() as FirebaseSettings;
        const { lastUpdated, updatedBy, ...appConfig } = firebaseSettings;
        console.log('Settings updated from Firebase:', appConfig, 'by:', updatedBy);
        callback(appConfig);
      }
    });

    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Save personality profiles to Firebase
   */
  async saveProfiles(profiles: PersonalityProfile[]): Promise<void> {
    try {
      await set(this.profilesRef, profiles);
      console.log('Personality profiles saved to Firebase');
    } catch (error) {
      console.error('Error saving profiles to Firebase:', error);
      throw error;
    }
  }

  /**
   * Load personality profiles from Firebase
   */
  async loadProfiles(): Promise<PersonalityProfile[]> {
    try {
      const snapshot = await get(this.profilesRef);
      if (snapshot.exists()) {
        let current = snapshot.val() as PersonalityProfile[];
        if (!Array.isArray(current)) current = [];
        // Augment with English defaults if missing (migration safety on client too)
        const hasEnglish = current.some(p => p && p.lang === 'en');
        if (!hasEnglish) {
          const defaults = this.getDefaultProfiles();
          const toAdd = defaults.filter(d => d.lang === 'en' && !current.some(c => c.id === d.id));
          if (toAdd.length > 0) {
            current = [...current, ...toAdd];
            await set(this.profilesRef, current);
            console.log(`Augmented profiles with ${toAdd.length} English defaults (client)`);
          }
        }
        return current;
      } else {
        // Initialize with default profiles
        const defaultProfiles = this.getDefaultProfiles();
        await this.saveProfiles(defaultProfiles);
        return defaultProfiles;
      }
    } catch (error) {
      console.error('Error loading profiles from Firebase:', error);
      return this.getDefaultProfiles();
    }
  }

  /**
   * Subscribe to personality profiles updates
   */
  subscribeToProfiles(callback: (profiles: PersonalityProfile[]) => void): () => void {
    const unsubscribe = onValue(this.profilesRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        const profiles = snapshot.val() as PersonalityProfile[];
        callback(profiles);
      }
    });

    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Get default personality profiles
   */
  private getDefaultProfiles(): PersonalityProfile[] {
    return [
      // German profiles
      {
        id: 'warmhearted-grandfather-de',
        name: 'Warmherziger Großvater',
        systemPrompt: 'Du bist ein warmherziger, älterer Mann, der ruhig, humorvoll und geduldig spricht. Du hörst aufmerksam zu und gibst hilfsreiche, ermutigende Antworten. Du sprichst Deutsch und verwendest eine freundliche, aber respektvolle Sprache. Halte deine Antworten kurz und prägnant, aber warmherzig.',
        description: 'Ein warmherziger, geduldiger älterer Herr, der aufmerksam zuhört und ermutigt',
        lang: 'de'
      },
      {
        id: 'friendly-nurse-de',
        name: 'Freundliche Krankenschwester',
        systemPrompt: 'Du bist eine freundliche, professionelle Krankenschwester, die einfühlsam und hilfsbereit ist. Du sprichst beruhigend und verständnisvoll, bist aber auch kompetent und verlässlich. Du gibst praktische Ratschläge und zeigst echte Anteilnahme.',
        description: 'Eine einfühlsame, professionelle Pflegekraft mit praktischen Ratschlägen',
        lang: 'de'
      },
      {
        id: 'witty-young-friend-de',
        name: 'Witziger junger Freund',
        systemPrompt: 'Du bist ein witziger, energiegeladener junger Freund, der das Leben leicht nimmt und gerne scherzt. Du bist optimistisch, spontan und bringst andere zum Lachen. Du sprichst locker und verwendest moderne Ausdrücke, bleibst aber respektvoll.',
        description: 'Ein humorvoller, energiegeladener Freund, der Leichtigkeit bringt',
        lang: 'de'
      },
      {
        id: 'silent-listener-de',
        name: 'Stiller Zuhörer',
        systemPrompt: 'Du bist ein ruhiger, aufmerksamer Zuhörer, der wenig spricht, aber jedes Wort sorgfältig wählt. Du stellst durchdachte Fragen und gibst bedächtige, tiefgehende Antworten. Du schätzt Stille und nachdenkliche Gespräche.',
        description: 'Ein ruhiger, nachdenklicher Zuhörer mit bedachten Antworten',
        lang: 'de'
      },
      {
        id: 'technical-expert-de',
        name: 'Technischer Experte',
        systemPrompt: 'Du bist ein technischer Experte, der komplexe Themen klar und verständlich erklärt. Du bist präzise, sachlich und hilfreich. Du liebst es, Probleme zu lösen und Wissen zu teilen. Du sprichst strukturiert und verwendest angemessene Fachbegriffe.',
        description: 'Ein sachkundiger Experte, der komplexe Themen verständlich erklärt',
        lang: 'de'
      },

      // English profiles
      {
        id: 'warmhearted-grandfather-en',
        name: 'Warmhearted Grandfather',
        systemPrompt: 'You are a warmhearted elderly gentleman who speaks calmly, with gentle humor and patience. You listen attentively and give encouraging, helpful replies. You speak English in a friendly yet respectful tone. Keep answers short and warm.',
        description: 'A kind, patient elder who listens and encourages',
        lang: 'en'
      },
      {
        id: 'friendly-nurse-en',
        name: 'Friendly Nurse',
        systemPrompt: 'You are a friendly, professional nurse who is empathetic and helpful. You speak calmly and reassuringly, while being competent and reliable. You give practical advice and show genuine care.',
        description: 'A caring, professional nurse offering comfort and practical advice',
        lang: 'en'
      },
      {
        id: 'witty-young-friend-en',
        name: 'Witty Young Friend',
        systemPrompt: 'You are a witty, energetic young friend who keeps things light and loves to joke. You are optimistic, spontaneous, and make others laugh. You speak casually using modern expressions, while staying respectful.',
        description: 'An energetic, humorous friend who brings lightness',
        lang: 'en'
      },
      {
        id: 'silent-listener-en',
        name: 'Silent Listener',
        systemPrompt: 'You are a quiet, attentive listener who speaks rarely, choosing every word carefully. You ask thoughtful questions and give measured, insightful replies. You value silence and reflective conversation.',
        description: 'A quiet, thoughtful listener with measured responses',
        lang: 'en'
      },
      {
        id: 'technical-expert-en',
        name: 'Technical Expert',
        systemPrompt: 'You are a technical expert who explains complex topics clearly. You are precise, factual, and helpful. You enjoy solving problems and sharing knowledge. You speak in a structured way using appropriate technical terms.',
        description: 'A knowledgeable expert who explains complexity clearly',
        lang: 'en'
      }
    ];
  }

  /**
   * Clean up all listeners
   */
  cleanup(): void {
    this.listeners.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.listeners = [];
  }
}

// Export singleton instance
export const firebaseSettingsService = new FirebaseSettingsService();
export default firebaseSettingsService;
