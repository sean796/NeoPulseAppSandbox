import { LLMSettingsTabContent } from "@/components/LLMSettingsTabContent";
import { SETTINGS_STUDIO_PANEL_CLASS } from "@/components/manager/settings/settings-studio-surfaces";

export type AiModelsSettingsContentProps = {
  researchModel: string;
  setResearchModel: (model: string) => void;
  blogModel: string;
  setBlogModel: (model: string) => void;
  imageModel: string;
  setImageModel: (model: string) => void;
  metaModel: string;
  setMetaModel: (model: string) => void;
  reportModel: string;
  setReportModel: (model: string) => void;
  adsModel: string;
  setAdsModel: (model: string) => void;
  videoModel: string;
  setVideoModel: (model: string) => void;
  decisionModel: string;
  setDecisionModel: (model: string) => void;
  temperature: number;
  setTemperature: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
};

export function AiModelsSettingsContent(props: AiModelsSettingsContentProps) {
  return (
    <section className={SETTINGS_STUDIO_PANEL_CLASS} aria-label="AI and Models">
      <LLMSettingsTabContent
        researchModel={props.researchModel}
        onResearchModelChange={props.setResearchModel}
        blogModel={props.blogModel}
        onBlogModelChange={props.setBlogModel}
        imageModel={props.imageModel}
        onImageModelChange={props.setImageModel}
        metaModel={props.metaModel}
        onMetaModelChange={props.setMetaModel}
        reportModel={props.reportModel}
        onReportModelChange={props.setReportModel}
        adsModel={props.adsModel}
        onAdsModelChange={props.setAdsModel}
        videoModel={props.videoModel}
        onVideoModelChange={props.setVideoModel}
        decisionModel={props.decisionModel}
        onDecisionModelChange={props.setDecisionModel}
        temperature={props.temperature}
        onTemperatureChange={props.setTemperature}
        maxTokens={props.maxTokens}
        onMaxTokensChange={props.setMaxTokens}
        topP={props.topP}
        onTopPChange={props.setTopP}
      />
    </section>
  );
}
