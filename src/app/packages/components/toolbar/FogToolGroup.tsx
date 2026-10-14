import React, { useEffect, useState } from "react"
import { Cloud, CloudFog, Eraser, Lasso, Paintbrush, Pentagon, Square, Trash2 } from "lucide-react"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import type { FogShapeMode } from "../../../tools/FogTool"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownModeSelector } from "../primitives/DropdownModeSelector"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { fogToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"
import { t } from '../../../i18n'

/** Fog and fog eraser, with the brush shape and size. DM only. */
export function FogToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const { view } = useAtlasUI()
  const emit = useEmitViewEvent()
  const [fogMode, setFogMode] = useState<FogShapeMode>('brush')
  const [brushSize, setBrushSize] = useState(50)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const face = fogToolFace(activeTool)

  // The fog renderer starts in brush mode with snap off, like this menu.
  useEffect(() => {
    emit('fog-mode-changed', 'brush');
    emit('fog-snap-changed', false);
  }, [emit]);

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('fog')}
      menuLabel={t('toolbar.fogOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={Cloud}
          label={t('toolbar.fogTool')}
          shortcut={hotkeyLabel('fog')}
          isActive={activeTool === "fog"}
          onClick={() => selectTool("fog")}
        />
        <DropdownMenuItem
          icon={Eraser}
          label={t('toolbar.fogEraser')}
          shortcut={hotkeyLabel('fog')}
          isActive={activeTool === "eraser"}
          onClick={() => selectTool("eraser")}
        />
      </div>

      <div className="atlas-dropdown-section">
        <div className="space-y-3">
          <DropdownModeSelector
            value={fogMode}
            options={[
              { value: 'brush' as const, icon: Paintbrush, label: t('toolbar.brush') },
              { value: 'lasso' as const, icon: Lasso, label: t('toolbar.lasso') },
              { value: 'rectangle' as const, icon: Square, label: t('toolbar.rectangle') },
              { value: 'polygon' as const, icon: Pentagon, label: t('toolbar.polygon') },
            ]}
            onChange={(mode) => {
              setFogMode(mode);
              emit('fog-mode-changed', mode);
            }}
          />

          {fogMode === 'brush' && (
            <DropdownSliderRow
              label={t('toolbar.brushSize')}
              value={brushSize}
              min={10}
              max={200}
              onChange={(size) => {
                setBrushSize(size);
                view?.setFogBrushSize(size);
              }}
            />
          )}

          <DropdownToggleRow
            label={t('toolbar.snapToGrid')}
            value={snapToGrid}
            onChange={() => {
              const next = !snapToGrid;
              setSnapToGrid(next);
              emit('fog-snap-changed', next);
            }}
          />
        </div>
      </div>

      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={CloudFog}
          label={t('toolbar.fogEntireMap')}
          onClick={() => {
            view?.fogEntireMap();
            closeMenu();
          }}
        />
        <DropdownMenuItem
          icon={Trash2}
          label={t('toolbar.deleteFog')}
          destructive
          onClick={() => {
            view?.clearAllFog();
            closeMenu();
          }}
        />
      </div>
    </ToolGroup>
  )
}
