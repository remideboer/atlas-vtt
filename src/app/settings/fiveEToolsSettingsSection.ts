import { Notice, type App } from 'obsidian';
import { FiveEToolsBestiary } from '../fiveETools/FiveEToolsBestiary';
import { directoryPickerAvailable, pickDirectory } from '../fiveETools/pickDirectory';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

/** Path to a local 5e.tools checkout used by Insert token. */
export function fiveEToolsSettingsSection(app: App, settings: SettingsService): AtlasSettingSection {
  return {
    heading: t('settings.fiveETools.heading'),
    rows: [{
      name: t('settings.fiveETools.path'),
      desc: t('settings.fiveETools.pathDesc'),
      aliases: ['5e.tools', '5etools', 'bestiary', 'd&d', 'monsters'],
      render: (setting) => {
        setting.addText((text) => {
          text
            .setPlaceholder(t('settings.fiveETools.pathPlaceholder'))
            .setValue(settings.getSetting('fiveEToolsPath'))
            .onChange((value) => {
              settings.setSetting('fiveEToolsPath', value.trim());
              FiveEToolsBestiary.forApp(app).invalidateCatalog();
            });
        });
        setting.addButton((button) => {
          button.setButtonText(t('picker.fiveETools.browse')).onClick(() => {
            if (!directoryPickerAvailable()) {
              new Notice(t('picker.fiveETools.browseUnavailable'));
              return;
            }
            void pickDirectory(settings.getSetting('fiveEToolsPath') || undefined).then((chosen) => {
              if (!chosen) return;
              settings.setSetting('fiveEToolsPath', chosen);
              FiveEToolsBestiary.forApp(app).invalidateCatalog();
              const input = setting.controlEl.querySelector('input');
              if (input) input.value = chosen;
            });
          });
        });
      },
    }],
  };
}
