import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Brush,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GitMerge,
  Image,
  Keyboard,
  MoveUpRight,
  MousePointer2,
  PencilLine,
  RotateCcw,
  Search,
  Split,
  Upload,
  Waves,
  X,
} from "lucide-react";
import type { CountrySearchOption } from "./countrySearch";
import { filterCountryOptions } from "./countrySearch";
import { customCountryAccentColor } from "./colorRuntime";
import type { CountryEntity, CountryFlag, DivideMethod, EditMode } from "./types";
import {
  builtinCountryFlag,
  countryFlagEquals,
  getCountryFlag,
  getCountryFlagUrl,
  normalizeFlagUpload,
  type FlagOption,
} from "./countryFlags";

type RegionPanelRow = {
  id: string;
  displayName: string;
  type: string;
};

type EditorSidePanelProps = {
  mode: EditMode;
  compactLayout: boolean;
  mobileExpanded: boolean;
  onToggleMobilePanel: () => void;
  onChangeMode: (mode: EditMode) => void;
  readOnly: boolean;
  attribution: string;
  entityOptions: CountrySearchOption[];
  selectedEntity?: CountryEntity;
  selectedEntityId: string;
  onSelectEntity: (entityId: string) => void;
  onUpdateEntityName: (name: string) => void;
  onUpdateEntityColor: (color: string) => void;
  flagOptions: FlagOption[];
  defaultEntityFlag: CountryFlag;
  onUpdateEntityFlag: (flag: CountryFlag) => void;
  onResetEntityFlag: () => void;
  onFinishMetadataEdit: () => void;
  inspectFocusedRegion?: RegionPanelRow;
  inspectRegionRows: RegionPanelRow[];
  onFocusInspectRegion: (regionId: string) => void;
  onUpdateFocusedRegionName: (name: string) => void;
  brushEnabled: boolean;
  onToggleBrush: () => void;
  onSelectAllTransferRegions: () => void;
  onClearTransferSelection: () => void;
  selectedTransferRegions: RegionPanelRow[];
  transferRegionRows: RegionPanelRow[];
  onToggleTransferRegion: (regionId: string) => void;
  focusedTransferRegion?: RegionPanelRow;
  onFocusTransferRegion: (regionId: string) => void;
  onSeparateRegion: (regionId: string) => void;
  transferTargetOptions: CountrySearchOption[];
  targetEntityId: string;
  onSelectTransferTarget: (entityId: string) => void;
  canTransfer: boolean;
  onApplyTransfer: () => void;
  divideCanSwap: boolean;
  divideHasDraft: boolean;
  divideError: string;
  divideIsCalculating: boolean;
  divideMethod: DivideMethod;
  divideAwaitingEnd: boolean;
  onChangeDivideMethod: (method: DivideMethod) => void;
  newCountryName: string;
  newCountryColor: string;
  onSwapDivideSides: () => void;
  onClearDivideDraft: () => void;
  onChangeNewCountryName: (name: string) => void;
  onChangeNewCountryColor: (color: string) => void;
  canCreateDividedCountry: boolean;
  onCreateDividedCountry: () => void;
  keyboardCutActive: boolean;
  keyboardCutPointCount: number;
  onStartKeyboardCut: () => void;
  onFinishKeyboardCut: () => void;
  onCancelKeyboardCut: () => void;
  mergeAvailableOptions: CountrySearchOption[];
  mergeSelectedEntities: CountrySearchOption[];
  mergeName: string;
  onAddMergeEntity: (entityId: string) => void;
  onZoomToMergeEntity: (entityId: string) => void;
  onRemoveMergeEntity: (entityId: string) => void;
  onClearMergeSelection: () => void;
  onChangeMergeName: (name: string) => void;
  canMerge: boolean;
  onMerge: () => void;
};

export function EditorSidePanel(props: EditorSidePanelProps) {
  const panelScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelScrollRef.current?.scrollTo({ top: 0 });
  }, [props.mode]);

  return (
    <aside className={`side-panel hud-panel${props.selectedEntity ? " has-country" : ""}`} aria-label="Country editor">
      <button
        className="mobile-panel-toggle"
        aria-label={props.mobileExpanded ? "Hide tools to show more map" : "Show tools"}
        aria-expanded={props.mobileExpanded}
        aria-controls="editor-panel-content"
        onClick={props.onToggleMobilePanel}
      >
        <span className="mobile-country-title" title={props.selectedEntity?.name}>
          {props.selectedEntity ? <img src={getCountryFlagUrl(getCountryFlag(props.selectedEntity))} alt="" /> : null}
          <span>{props.selectedEntity?.name || "Country tools"}</span>
        </span>
        <span className="mobile-panel-toggle-action">
          {props.mobileExpanded ? "Hide tools" : "Show tools"}
          {props.mobileExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </span>
      </button>
      {!props.compactLayout ? (
        <div className="hud-panel-heading">
          {props.selectedEntity ? (
            <CountrySummary key={props.selectedEntity.id} entity={props.selectedEntity} onClear={() => props.onSelectEntity("")} />
          ) : (
            <h2>{props.mode === "merge" ? "Merge countries" : "Country tools"}</h2>
          )}
        </div>
      ) : null}
      <PanelNav mode={props.mode} readOnly={props.readOnly} onChangeMode={props.onChangeMode} />

      <div id="editor-panel-content" className="hud-panel-body" hidden={props.compactLayout && !props.mobileExpanded}>
        <div className="hud-mode-panel" role="tabpanel" id="editor-mode-panel" aria-labelledby={`editor-mode-${props.mode}`}>
          <div ref={panelScrollRef} className="panel-scroll">
            <div key={props.mode} className="panel-mode-content">
          {props.mode === "inspect" ? <InspectPanel {...props} /> : null}
          {props.mode === "transfer" ? <TransferPanel {...props} /> : null}
          {props.mode === "divide" ? <DividePanel {...props} /> : null}
          {props.mode === "merge" ? <MergePanel {...props} /> : null}
        </div>

        {props.mode === "inspect" ? <details className="panel-about">
          <summary>About map data <ChevronDown className="disclosure-icon" size={14} aria-hidden="true" /></summary>
          <p>{props.attribution}</p>
        </details> : null}
        </div>
        <PanelAction {...props} />
        </div>
      </div>
    </aside>
  );
}

function PanelAction(props: EditorSidePanelProps) {
  if (props.readOnly || !props.selectedEntity) return null;
  const count = props.selectedTransferRegions.length;
  if (props.mode === "transfer") {
    const target = props.transferTargetOptions.find((option) => option.id === props.targetEntityId);
    return (
      <footer className="panel-action">
        {target && count > 0 ? <p className="transfer-route"><span>{props.selectedEntity.name}</span><ChevronRight size={14} aria-hidden="true" /><strong>{target.name}</strong></p> : null}
        <button className="primary wide" disabled={!props.canTransfer} onClick={props.onApplyTransfer}>
          <span>Transfer {count} {count === 1 ? "region" : "regions"}</span><ChevronRight size={17} aria-hidden="true" />
        </button>
        <p className="action-hint">{count === 0 ? "Select regions on the map or by name." : !target ? "Choose a destination country." : "You can undo this change."}</p>
      </footer>
    );
  }
  if (props.mode === "divide" && props.divideCanSwap && !props.divideIsCalculating) {
    return (
      <footer className="panel-action">
        <button className="primary wide" disabled={!props.canCreateDividedCountry} onClick={props.onCreateDividedCountry}>
          <span>Create country</span><ChevronRight size={17} aria-hidden="true" />
        </button>
        <p className="action-hint">{props.newCountryName.trim() ? "You can undo this change." : "Enter a name for the new country."}</p>
      </footer>
    );
  }
  return null;
}

function InspectPanel(props: EditorSidePanelProps) {
  return (
    <>
      <CountryContext
        selectedEntity={props.selectedEntity}
        readOnly={props.readOnly}
        onUpdateEntityName={props.onUpdateEntityName}
        onUpdateEntityColor={props.onUpdateEntityColor}
        flagOptions={props.flagOptions}
        defaultEntityFlag={props.defaultEntityFlag}
        onUpdateEntityFlag={props.onUpdateEntityFlag}
        onResetEntityFlag={props.onResetEntityFlag}
        onFinishMetadataEdit={props.onFinishMetadataEdit}
      />

      {props.selectedEntity ? (
        <section className="context-section">
          {props.inspectFocusedRegion ? (
            <RegionSummary title="Selected region" name={props.inspectFocusedRegion.displayName}>
              <label className="field">
                <span>Region name</span>
                <input
                  value={props.inspectFocusedRegion.displayName}
                  disabled={props.readOnly}
                  onChange={(event) => props.onUpdateFocusedRegionName(event.target.value)}
                  onBlur={props.onFinishMetadataEdit}
                />
              </label>
            </RegionSummary>
          ) : null}

          {props.inspectRegionRows.length > 0 ? (
            <details className="region-browser">
              <summary>
                <span>Regions</span>
                <small>{props.inspectRegionRows.length}</small>
                <ChevronDown className="disclosure-icon" size={16} aria-hidden="true" />
              </summary>
              <RegionList
                regions={props.inspectRegionRows}
                focusedRegionId={props.inspectFocusedRegion?.id ?? ""}
                onSelect={props.onFocusInspectRegion}
              />
            </details>
          ) : (
            <div className="empty-state">This country has no editable regions.</div>
          )}
        </section>
      ) : null}
    </>
  );
}

function TransferPanel(props: EditorSidePanelProps) {
  const selectedCount = props.selectedTransferRegions.length;
  if (!props.selectedEntity) return (
    <div className="country-intro tool-intro">
      <h3>Transfer regions</h3>
      <p>Select the country that owns the regions, or use Find a country.</p>
    </div>
  );
  const selectedRow = (region: RegionPanelRow) => (
    <div className="transfer-selected-row" key={region.id}>
      <Check size={14} aria-hidden="true" />
      <button className="transfer-selected-name" onClick={() => props.onFocusTransferRegion(region.id)}>{region.displayName}</button>
      <button className="transfer-selected-remove" aria-label={`Deselect ${region.displayName}`} disabled={props.readOnly} onClick={() => props.onToggleTransferRegion(region.id)}><X size={14} /></button>
    </div>
  );
  return (
    <>
      <section className={`workflow-step transfer-selection${selectedCount > 0 ? " has-selection" : ""}`}>
        <div className="section-title-row">
          <h3 className="section-heading">Choose regions</h3>
          <span aria-live="polite">{selectedCount} selected</span>
        </div>
        <TransferSelectionControls {...props} />
        {selectedCount === 0 ? <p className="hint">{props.brushEnabled ? "Drag across regions to select them." : "Select regions on the map or from the list below."}</p> : null}
        <TransferRegionPicker
          key={props.selectedEntityId}
          regions={props.transferRegionRows}
          selectedRegions={props.selectedTransferRegions}
          readOnly={props.readOnly}
          onToggle={props.onToggleTransferRegion}
          selectionControls={<TransferSelectionControls {...props} />}
        >
          {props.focusedTransferRegion ? <details className="transfer-extra">
            <summary>More region tools <ChevronDown size={14} aria-hidden="true" /></summary>
            <p className="hint">{props.focusedTransferRegion.displayName}</p>
            <button className="compact" disabled={props.readOnly} onClick={() => props.onSeparateRegion(props.focusedTransferRegion!.id)}><Split size={15} /> Make region a country</button>
          </details> : null}
        </TransferRegionPicker>
        {selectedCount > 0 ? <div className="transfer-selected-list">
          {props.selectedTransferRegions.slice(0, 3).map(selectedRow)}
          {selectedCount > 3 ? <details className="transfer-more-regions"><summary>Show {selectedCount - 3} more selected {selectedCount === 4 ? "region" : "regions"} <ChevronDown size={14} aria-hidden="true" /></summary>{props.selectedTransferRegions.slice(3).map(selectedRow)}</details> : null}
        </div> : null}
      </section>
      {selectedCount > 0 ? (
        <section className="workflow-step transfer-destination">
          <CountrySearchSelect label="Destination country" clearLabel="Clear destination country" value={props.targetEntityId} options={props.transferTargetOptions} onChange={props.onSelectTransferTarget} disabled={props.readOnly} placeholder="Find a country" />
          <p className="hint">Selected regions will become part of this country.</p>
        </section>
      ) : null}

    </>
  );
}

function TransferSelectionControls(props: EditorSidePanelProps) {
  return (
    <div className="switch-row selection-methods" role="group" aria-label="Region selection">
      <button className="compact" aria-pressed={!props.brushEnabled} disabled={props.readOnly} onClick={() => { if (props.brushEnabled) props.onToggleBrush(); }}><MousePointer2 size={15} /> Select</button>
      <button className="compact" aria-pressed={props.brushEnabled} disabled={props.readOnly} onClick={() => { if (!props.brushEnabled) props.onToggleBrush(); }}><Brush size={15} /> Brush</button>
      <button className="compact" disabled={props.readOnly} onClick={props.onSelectAllTransferRegions}>Select all</button>
      <button className="compact quiet-action" aria-label="Clear selected regions" disabled={props.readOnly || props.selectedTransferRegions.length === 0} onClick={props.onClearTransferSelection}>Clear</button>
    </div>
  );
}

function DividePanel(props: EditorSidePanelProps) {
  const previewReady = props.divideCanSwap && !props.divideIsCalculating;
  const instructions = props.divideMethod === "island"
    ? ["Choose an island", "Select the island that will become a new country."]
    : props.divideMethod === "draw"
      ? ["Draw your new border", "Drag from one side of the country to the other. Start and finish outside its border."]
      : props.divideAwaitingEnd
        ? ["Place the second point", "Place it outside the opposite edge so the line crosses the country."]
        : ["Place the first point", "Place it just outside the country. The second point goes outside the opposite edge."];

  return (
    <>
      {!props.selectedEntity ? (
      <CountryContext
        selectedEntity={props.selectedEntity}
        readOnly={props.readOnly}
        onUpdateEntityName={props.onUpdateEntityName}
        onUpdateEntityColor={props.onUpdateEntityColor}
        flagOptions={props.flagOptions}
        defaultEntityFlag={props.defaultEntityFlag}
        onUpdateEntityFlag={props.onUpdateEntityFlag}
        onResetEntityFlag={props.onResetEntityFlag}
        onFinishMetadataEdit={props.onFinishMetadataEdit}
        showEditingFields={false}
      />
      ) : null}

      {props.selectedEntity ? (
        <div className={`divide-workflow${previewReady ? " is-ready" : ""}`}>
          <ol className="divide-steps" aria-label="Divide steps">
            <li className={previewReady ? "complete" : "current"} aria-current={!previewReady ? "step" : undefined}>
              <span>{previewReady ? <Check size={13} aria-hidden="true" /> : "1"}</span> Set border
            </li>
            <li className={previewReady ? "current" : ""} aria-current={previewReady ? "step" : undefined}>
              <span>2</span> Create country
            </li>
          </ol>

          {!previewReady ? (
            <>
              <div className="divide-methods" role="group" aria-label="Border method">
                <button className="compact" aria-pressed={props.divideMethod === "line"} disabled={props.readOnly} onClick={() => props.onChangeDivideMethod("line")}>
                  <MoveUpRight size={16} aria-hidden="true" /> Two points
                </button>
                <button className="compact" aria-pressed={props.divideMethod === "draw"} disabled={props.readOnly} onClick={() => props.onChangeDivideMethod("draw")}>
                  <PencilLine size={16} aria-hidden="true" /> Draw
                </button>
                <button className="compact" aria-pressed={props.divideMethod === "island"} disabled={props.readOnly} onClick={() => props.onChangeDivideMethod("island")}>
                  <Waves size={16} aria-hidden="true" /> Island
                </button>
              </div>
              {!props.keyboardCutActive && !props.divideIsCalculating ? (
                <div className="divide-instructions" role="status">
                  <h3>{instructions[0]}</h3>
                  <p>{instructions[1]}</p>
                </div>
              ) : null}
              {props.divideIsCalculating ? <div className="tool-status" role="status">Checking your new border...</div> : null}
            </>
          ) : null}

          {props.divideError ? <div className="tool-error" role="alert">{props.divideError}</div> : null}
          {props.divideHasDraft ? (
            <>
              {previewReady ? (
              <>
                <div className="divide-border-review">
                  <span className="divide-ready" role="status"><Check size={16} aria-hidden="true" /> Border ready</span>
                  <button className="compact quiet-action" disabled={props.readOnly} onClick={props.onClearDivideDraft}>Reset border</button>
                </div>
                <label className="field">
                  <span>New country name</span>
                  <input id="divide-country-name" value={props.newCountryName} disabled={props.readOnly} onChange={(event) => props.onChangeNewCountryName(event.target.value)} placeholder="e.g. South Germany" />
                </label>
                <div className="divide-side-row">
                  <label className="divide-color-field">
                    <input type="color" aria-label="New country color" value={props.newCountryColor} disabled={props.readOnly} onInput={(event) => props.onChangeNewCountryColor(event.currentTarget.value)} onChange={(event) => props.onChangeNewCountryColor(event.target.value)} />
                    <span>Country color</span>
                  </label>
                  <button className="compact quiet-action" disabled={props.readOnly} onClick={props.onSwapDivideSides}><ArrowLeftRight size={14} aria-hidden="true" /> Switch side</button>
                </div>
                <p className="hint divide-side-hint">The highlighted land becomes the new country. Use Switch side to choose the other part.</p>
              </>
            ) : null}
              {!previewReady ? <button className="compact divide-start-over" disabled={props.readOnly} onClick={props.onClearDivideDraft}>
                <RotateCcw size={14} aria-hidden="true" /> Reset border
              </button> : null}
            </>
          ) : null}

          {!props.readOnly && !previewReady && props.divideMethod !== "island" ? (
            <details className="keyboard-cut-controls">
              <summary><Keyboard size={15} aria-hidden="true" /> Keyboard controls <ChevronDown size={14} className="disclosure-icon" aria-hidden="true" /></summary>
              <button id="keyboard-cut-start" className="compact" onClick={props.onStartKeyboardCut}>
                {props.keyboardCutActive ? "Restart keyboard border" : "Set border with keyboard"}
              </button>
              {props.keyboardCutActive ? (
                <>
                  <p id="keyboard-cut-help" className="hint" role="status">
                    Use arrow keys to move the marker. Hold Shift to move faster. Press Enter to add a point.
                    Add points on both sides of the country, then press F to finish. Backspace removes a point.
                    Escape cancels. {props.keyboardCutPointCount} {props.keyboardCutPointCount === 1 ? "point" : "points"} placed.
                  </p>
                  <div className="switch-row">
                    <button className="compact" disabled={props.keyboardCutPointCount < 2} onClick={props.onFinishKeyboardCut}>Preview border</button>
                    <button className="compact" onClick={props.onCancelKeyboardCut}>Cancel border</button>
                  </div>
                </>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function TransferRegionPicker({
  regions,
  selectedRegions,
  readOnly,
  onToggle,
  selectionControls,
  children,
}: {
  regions: RegionPanelRow[];
  selectedRegions: RegionPanelRow[];
  readOnly: boolean;
  onToggle: (regionId: string) => void;
  selectionControls: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(selectedRegions.map((region) => region.id)), [selectedRegions]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? regions.filter((region) => region.displayName.toLocaleLowerCase().includes(needle)) : regions;
  }, [query, regions]);

  return (
    <details className="region-picker">
      <summary><span className="region-picker-desktop-label">Choose regions by name</span><span className="region-picker-mobile-label">{selectedRegions.length > 0 ? `${selectedRegions.length} ${selectedRegions.length === 1 ? "region" : "regions"} selected · Edit` : "Choose regions by name"}</span><ChevronDown className="disclosure-icon" size={16} aria-hidden="true" /></summary>
      <div className="region-picker-body">
        <div className="transfer-picker-methods">{selectionControls}</div>
        <label className="field">
          <span>Find a region</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="region-picker-list" role="group" aria-label="Source regions">
          {matches.length > 0 ? matches.map((region) => (
            <label key={region.id} className="region-picker-row">
              <input
                type="checkbox"
                checked={selectedIds.has(region.id)}
                disabled={readOnly}
                onChange={() => onToggle(region.id)}
              />
              <span>{region.displayName}</span>
            </label>
          )) : <p className="hint">No regions found. Try another name.</p>}
        </div>
        {children}
      </div>
    </details>
  );
}

function MergePanel(props: EditorSidePanelProps) {
  return (
    <>
      <section className="context-section country-context">
        <div className="section-heading">Add countries</div>
        <CountrySearchSelect
          label="Country to add"
          value=""
          options={props.mergeAvailableOptions}
          onChange={props.onAddMergeEntity}
          disabled={props.readOnly}
          placeholder="Search countries"
          resetAfterChange
        />
        {props.mergeSelectedEntities.length === 0 ? (
          <p className="hint">Select countries on the map, or search by name.</p>
        ) : null}
      </section>

      {props.mergeSelectedEntities.length > 0 ? (
        <div className="tool-card">
          <div className="section-title-row">
            <div className="section-heading">Selected countries</div>
            <span>{props.mergeSelectedEntities.length}</span>
          </div>
          <CountryList
            entities={props.mergeSelectedEntities}
            onSelect={props.onZoomToMergeEntity}
            onRemove={props.onRemoveMergeEntity}
          />
          <div className="switch-row">
            <button className="compact" onClick={props.onClearMergeSelection}>Clear selected countries</button>
          </div>
          {props.canMerge ? (
            <>
              <label className="field">
                <span>New country name (optional)</span>
                <input
                  value={props.mergeName}
                  disabled={props.readOnly}
                  onChange={(event) => props.onChangeMergeName(event.target.value)}
                  placeholder="e.g. Baltic Union"
                />
              </label>
              <p className="hint">Leave blank for an automatic name.</p>
              <button className="primary wide" disabled={props.readOnly} onClick={props.onMerge}>
                <GitMerge size={16} /> Merge {props.mergeSelectedEntities.length} countries
              </button>
            </>
          ) : (
            <p className="hint">Select one more country.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function CountryContext({
  selectedEntity,
  readOnly,
  onUpdateEntityName,
  onUpdateEntityColor,
  flagOptions,
  defaultEntityFlag,
  onUpdateEntityFlag,
  onResetEntityFlag,
  onFinishMetadataEdit,
  showEditingFields = true,
}: {
  selectedEntity?: CountryEntity;
  readOnly: boolean;
  onUpdateEntityName: (name: string) => void;
  onUpdateEntityColor: (color: string) => void;
  flagOptions: FlagOption[];
  defaultEntityFlag: CountryFlag;
  onUpdateEntityFlag: (flag: CountryFlag) => void;
  onResetEntityFlag: () => void;
  onFinishMetadataEdit: () => void;
  showEditingFields?: boolean;
}) {
  return (
    <section className={`context-section country-context${showEditingFields ? "" : " compact-context-card"}`}>
      {!selectedEntity ? (
        <>
          <div className="country-intro">
            <h2>{showEditingFields ? "Choose a country" : "Divide a country"}</h2>
            <p>
              {showEditingFields
                ? "Select a country on the map, or use Find a country."
                : "Select a country to split, or use Find a country."}
            </p>
          </div>

        </>
      ) : null}

      {selectedEntity && showEditingFields ? (
        <details className="country-appearance">
          <summary>
            <span>Appearance</span>
            <small>Edit name, color, and flag</small>
            <ChevronDown className="disclosure-icon" size={16} aria-hidden="true" />
          </summary>
          <div className="country-edit-fields">
          <label className="field">
            <span>Country name</span>
            <input
              value={selectedEntity.name}
              disabled={readOnly}
              onChange={(event) => onUpdateEntityName(event.target.value)}
              onBlur={onFinishMetadataEdit}
            />
          </label>

          <label className="field color-field">
            <span>Color</span>
            <input
              type="color"
              value={selectedEntity.color ?? customCountryAccentColor}
              disabled={readOnly}
              onInput={(event) => onUpdateEntityColor(event.currentTarget.value)}
              onChange={(event) => onUpdateEntityColor(event.target.value)}
              onBlur={onFinishMetadataEdit}
            />
          </label>

          <FlagEditor
            entity={selectedEntity}
            options={flagOptions}
            defaultFlag={defaultEntityFlag}
            disabled={readOnly}
            onChange={onUpdateEntityFlag}
            onReset={onResetEntityFlag}
          />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function CountrySummary({ entity, onClear }: { entity: CountryEntity; onClear?: () => void }) {
  const regionCount = entity.regionIds.length;
  return (
    <div className="country-summary">
      <div className="country-summary-markers" aria-hidden="true">
        <img className="country-summary-flag" src={getCountryFlagUrl(getCountryFlag(entity))} alt="" />
      </div>
      <div className="country-summary-text">
        <h2 className="country-summary-name" title={entity.name}>{entity.name}</h2>
        <div className="country-summary-meta">
          <span className="country-swatch" style={{ backgroundColor: entity.color }} aria-hidden="true" />
          <span>{regionCount.toLocaleString()} {regionCount === 1 ? "region" : "regions"}</span>
          {entity.isCustom ? <span>Custom country</span> : null}
        </div>
      </div>
      {onClear ? (
        <button className="country-summary-clear" onClick={onClear} title="Clear country selection" aria-label="Clear country selection">
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

function FlagEditor({
  entity,
  options,
  defaultFlag,
  disabled,
  onChange,
  onReset,
}: {
  entity: CountryEntity;
  options: FlagOption[];
  defaultFlag: CountryFlag;
  disabled: boolean;
  onChange: (flag: CountryFlag) => void;
  onReset: () => void;
}) {
  const currentFlag = getCountryFlag(entity);
  const [uploadError, setUploadError] = useState("");
  const uploadRequestRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    // Discard pending uploads when their country or flag is no longer current.
    return () => { uploadRequestRef.current += 1; };
  }, [entity.id, currentFlag, disabled]);

  useEffect(() => setUploadError(""), [entity.id]);

  return (
    <div className="field flag-editor">
      <span>Flag</span>
      <div className="flag-preview-row">
        <img className="flag-preview" src={getCountryFlagUrl(currentFlag)} alt={`${entity.name} flag`} />
        <div>
          <strong>{currentFlag.kind === "custom" ? "Custom image" : "Country flag"}</strong>
          <small>{currentFlag.kind === "builtin" ? currentFlag.id.toUpperCase() : "128 × 96 WebP"}</small>
        </div>
      </div>

      <CountrySearchSelect
        label="Choose a flag"
        value={currentFlag.kind === "builtin" && currentFlag.id !== "neutral" ? currentFlag.id : ""}
        options={options}
        onChange={(flagId) => {
          if (!flagId) return;
          uploadRequestRef.current += 1;
          setUploadError("");
          onChange(builtinCountryFlag(flagId));
        }}
        disabled={disabled}
        placeholder="Search flags"
        clearable={false}
      />

      <div className="flag-actions">
        <label className={disabled ? "button-like compact disabled" : "button-like compact"}>
          <Upload size={15} aria-hidden="true" /> Upload image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const requestId = ++uploadRequestRef.current;
              setUploadError("");
              void normalizeFlagUpload(file)
                .then((flag) => {
                  if (requestId === uploadRequestRef.current) onChangeRef.current(flag);
                })
                .catch((error: unknown) => {
                  if (requestId !== uploadRequestRef.current) return;
                  setUploadError(error instanceof Error ? error.message : "The image could not be processed.");
                });
            }}
          />
        </label>
        <button
          type="button"
          className="compact"
          disabled={disabled || countryFlagEquals(currentFlag, defaultFlag)}
          onClick={() => {
            uploadRequestRef.current += 1;
            setUploadError("");
            onReset();
          }}
        >
          <RotateCcw size={15} aria-hidden="true" /> Reset
        </button>
      </div>
      {uploadError ? <div className="tool-error" role="alert">{uploadError}</div> : null}
      <p className="hint flag-upload-hint">
        <Image size={13} aria-hidden="true" /> PNG, JPEG, WebP, or SVG. Maximum 2 MiB.
      </p>
    </div>
  );
}

export function CountrySearchSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  resetAfterChange = false,
  clearable = true,
  clearLabel = "Clear country selection",
}: {
  label: string;
  value: string;
  options: CountrySearchOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  resetAfterChange?: boolean;
  clearable?: boolean;
  clearLabel?: string;
}) {
  const listboxId = useId();
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selectedOption?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selectedOption?.name ?? "");
  }, [selectedOption?.name]);

  const filteredOptions = useMemo(
    () => filterCountryOptions(options, query, value),
    [options, query, value],
  );
  const activeOptionIndex = Math.min(activeIndex, Math.max(0, filteredOptions.length - 1));

  useEffect(() => {
    if (!open) return;
    listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeOptionIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeOptionIndex, open, query]);

  return (
    <div
      className="field country-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery(selectedOption?.name ?? "");
        }
      }}
    >
      <span id={labelId}>{label}</span>
      <div className="country-search-control">
        <Search size={15} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-labelledby={labelId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={open && filteredOptions.length > 0 ? `${listboxId}-${activeOptionIndex}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(event) => {
            event.currentTarget.select();
            setActiveIndex(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (open && filteredOptions.length > 0) {
                setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + filteredOptions.length) % filteredOptions.length);
              }
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery(selectedOption?.name ?? "");
              return;
            }
            if (event.key === "Enter" && filteredOptions.length > 0 && (open || filteredOptions.length === 1)) {
              event.preventDefault();
              const option = filteredOptions[Math.min(activeIndex, filteredOptions.length - 1)];
              onChange(option.id);
              setQuery(resetAfterChange ? "" : option.name);
              setActiveIndex(0);
              setOpen(false);
              if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
            }
          }}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            className="country-search-clear"
            title={clearLabel}
            aria-label={clearLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery("");
              setActiveIndex(0);
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div ref={listboxRef} className="country-search-results" id={listboxId} role="listbox" aria-labelledby={labelId}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`${listboxId}-${index}`}
                aria-selected={option.id === value}
                key={option.id}
                className={index === activeOptionIndex ? "keyboard-active" : option.id === value ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(option.id);
                  setQuery(resetAfterChange ? "" : option.name);
                  setActiveIndex(0);
                  setOpen(false);
                  if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
                }}
              >
                <span>{option.name}</span>
                <small>{option.meta ?? option.id}</small>
              </button>
            ))
          ) : (
            <div className="country-search-empty" role="status">{label === "Choose a flag" ? "No flags found. Try another name." : "No countries found. Try another name."}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RegionSummary({
  title,
  name,
  className = "",
  children,
}: {
  title: string;
  name: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={["region-detail", className].filter(Boolean).join(" ")}>
      <div className="region-detail-header">
        <span>{title}</span>
        <strong>{name}</strong>
      </div>
      {children}
    </div>
  );
}

function RegionList({
  regions,
  focusedRegionId,
  onSelect,
  className = "",
}: {
  regions: RegionPanelRow[];
  focusedRegionId: string;
  onSelect: (regionId: string) => void;
  className?: string;
}) {
  return (
    <div className={["region-list", className].filter(Boolean).join(" ")} role="list">
      {regions.map((region) => (
        <div key={region.id} role="listitem">
          <button
            className={focusedRegionId === region.id ? "region-row active" : "region-row"}
            onClick={() => onSelect(region.id)}
          >
            <span>{region.displayName}</span>
            <small>{region.type}</small>
          </button>
        </div>
      ))}
    </div>
  );
}

function CountryList({
  entities,
  onSelect,
  onRemove,
}: {
  entities: CountrySearchOption[];
  onSelect: (entityId: string) => void;
  onRemove: (entityId: string) => void;
}) {
  return (
    <div className="region-list country-list" role="list">
      {entities.map((entity) => (
        <div key={entity.id} className="country-list-item" role="listitem">
          <button className="region-row" onClick={() => onSelect(entity.id)}>
            <span>{entity.name}</span>
          </button>
          <button className="country-list-remove" aria-label={`Remove ${entity.name} from merge`} onClick={() => onRemove(entity.id)}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PanelNav({
  mode,
  readOnly,
  onChangeMode,
}: {
  mode: EditMode;
  readOnly: boolean;
  onChangeMode: (mode: EditMode) => void;
}) {
  const modes: Array<{ id: EditMode; label: string }> = [
    { id: "inspect", label: "Inspect" },
    { id: "transfer", label: "Transfer" },
    { id: "divide", label: "Divide" },
    { id: "merge", label: "Merge" },
  ];

  return (
    <div className="panel-nav">
      <div className="mode-tabs" role="tablist" aria-label="Editor mode">
        {modes.map((entry, index) => (
          <button
            key={entry.id}
            id={`editor-mode-${entry.id}`}
            role="tab"
            aria-selected={mode === entry.id}
            aria-controls="editor-mode-panel"
            tabIndex={mode === entry.id ? 0 : -1}
            className={mode === entry.id ? "active" : ""}
            onClick={() => onChangeMode(entry.id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === "ArrowRight") nextIndex = (index + 1) % modes.length;
              else if (event.key === "ArrowLeft") nextIndex = (index - 1 + modes.length) % modes.length;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = modes.length - 1;
              else return;
              event.preventDefault();
              onChangeMode(modes[nextIndex].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {readOnly ? <span className="viewer-badge"><Eye size={14} /> View only</span> : null}
    </div>
  );
}
