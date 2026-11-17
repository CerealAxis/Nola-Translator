"""Comic domain contracts shared by storage and the private HTTP boundary."""
from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class Model(BaseModel):
  model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


Color = Annotated[str, Field(pattern=r'^#[a-fA-F0-9]{6}$')]
Point = tuple[Annotated[float, Field(ge=0)], Annotated[float, Field(ge=0)]]


class AutoSelection(Model):
  mode: Literal['auto'] = 'auto'


class OffSelection(Model):
  mode: Literal['off'] = 'off'


class SelectedSelection(Model):
  mode: Literal['selected']
  libraryIds: list[UUID] = Field(max_length=1000)


Selection = AutoSelection | OffSelection | SelectedSelection


class RenderSettings(Model):
  fontFamily: str = Field(default='Noto Sans SC', max_length=200)
  autoFont: bool = True
  fontSize: float = Field(default=23, ge=6, le=200)
  autoSize: bool = True
  direction: Literal['auto', 'horizontal', 'vertical-rl'] = 'auto'
  color: Color = '#222222'
  autoColor: bool = True
  strokeColor: Color = '#ffffff'
  strokeWidth: float = Field(default=0, ge=0, le=10)
  lineSpacing: float = Field(default=1.4, ge=.5, le=3)
  autoLineSpacing: bool = True
  align: Literal['left', 'center', 'right'] = 'center'
  autoAlign: bool = True
  blockAlign: Literal['left', 'center', 'right'] = 'center'
  autoBlockAlign: bool = True
  fillColor: Color = '#ffffff'


class Config(Model):
  sourceLanguage: str = Field(default='ja', min_length=1, max_length=32)
  targetLanguage: str = Field(default='zh', min_length=1, max_length=32)
  normalModel: str = Field(default='', max_length=512)
  visualModel: str = Field(default='', max_length=512)
  proofModel: str = Field(default='', max_length=512)
  rounds: int = Field(default=2, ge=1, le=3)
  detector: Literal['auto', 'ppocr', 'rtdetr', 'rfdetr-seg'] = 'auto'
  ocr: Literal['auto', 'ppocr', 'manga-ocr'] = 'auto'
  repairMethod: Literal['auto', 'lama-manga', 'telea', 'solid'] = 'auto'
  glossary: Selection = Field(default_factory=AutoSelection, discriminator='mode')
  excludedSelection: Selection = Field(default_factory=AutoSelection, discriminator='mode')
  renderSettings: RenderSettings = Field(default_factory=RenderSettings)


class Style(Model):
  fontFamily: str | None = Field(default=None, max_length=200)
  autoFont: bool = False
  fontSize: float = Field(default=23, ge=6, le=200)
  color: Color = '#222222'
  strokeColor: Color = '#ffffff'
  strokeWidth: float = Field(default=0, ge=0, le=10)
  direction: Literal['horizontal', 'vertical-rl'] = 'horizontal'
  align: Literal['left', 'center', 'right'] = 'center'
  blockAlign: Literal['left', 'center', 'right'] = 'center'
  lineSpacing: float = Field(default=1.4, ge=.5, le=3)
  autoLineSpacing: bool = False
  autoAlign: bool = False
  autoBlockAlign: bool = False
  angle: float = Field(default=0, ge=-180, le=180)
  autoFontSize: bool = True


class Region(Model):
  id: UUID
  sourceText: str = Field(default='', max_length=64000)
  targetText: str | None = Field(default=None, max_length=64000)
  x: float = Field(ge=0)
  y: float = Field(ge=0)
  width: float = Field(gt=0)
  height: float = Field(gt=0)
  sourceQuad: list[Point] | None = Field(default=None, min_length=4, max_length=4)
  sourceLines: list[Annotated[list[Point], Field(min_length=4, max_length=4)]] | None = Field(default=None, max_length=256)
  sourceFontSize: float | None = Field(default=None, gt=0, le=4096)
  textQuad: list[Point] | None = Field(default=None, min_length=4, max_length=4)
  confidence: float | None = Field(default=None, ge=0, le=1)
  locked: bool = False
  ignored: bool = False
  manuallyEdited: bool = False
  style: Style = Field(default_factory=Style)
  qa: list[str] = Field(default_factory=list, max_length=20)
  resolvedLayout: dict | None = None

  @field_validator('textQuad')
  @classmethod
  def validate_text_quad(cls, points):
    if points is not None:
      crosses = []
      for index in range(4):
        a, b, c = points[index], points[(index+1)%4], points[(index+2)%4]
        crosses.append((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))
      if not (all(value > 1 for value in crosses) or all(value < -1 for value in crosses)):
        raise ValueError('invalidTextQuad')
    return points


class Stroke(Model):
  id: UUID
  mode: Literal['erase', 'restore']
  size: float = Field(gt=0, le=200)
  points: list[Point] = Field(min_length=1, max_length=20000)


class PageEdit(Model):
  id: UUID
  regions: list[Region] = Field(max_length=2048)
  maskStrokes: list[Stroke] | None = Field(default=None, max_length=1000)


class ConfigureCommand(Model):
  action: Literal['configure']
  config: Config


class SavePagesCommand(Model):
  action: Literal['savePages']
  pages: list[PageEdit] = Field(min_length=1, max_length=1000)


class UndoCommand(Model):
  action: Literal['undo']


class RedoCommand(Model):
  action: Literal['redo']


class ApplyProofCommand(Model):
  action: Literal['applyProof']
  jobId: UUID


Command = Annotated[ConfigureCommand | SavePagesCommand | UndoCommand | RedoCommand | ApplyProofCommand,
  Field(discriminator='action')]


class Mutation(Model):
  operationId: UUID
  expectedRevision: int = Field(ge=0)
  command: dict

  @field_validator('command', mode='before', json_schema_input_type=Command)
  @classmethod
  def validate_command(cls, value):
    return TypeAdapter(Command).validate_python(value).model_dump(mode='json', exclude_none=True)


class ImportRequest(Model):
  paths: list[str] = Field(min_length=1, max_length=1000)
  title: str | None = Field(default=None, max_length=200)
  projectId: UUID | None = None
  chapterId: UUID | None = None
  quick: bool = False
  kind: Literal['auto', 'images', 'folder', 'archive', 'pdf', 'ebook'] = 'auto'
  pdfDpi: int = Field(default=200, ge=72, le=600)
  firstPage: int = Field(default=1, ge=1)
  lastPage: int | None = Field(default=None, ge=1)
  firstFrame: bool = False


Kind = Literal['normal', 'visual', 'proof', 'erase', 'detect', 'ocr', 'repair', 'translate']


class JobRequest(Model):
  projectId: UUID
  expectedRevision: int = Field(ge=0)
  kind: Kind
  pageIds: list[UUID] = Field(min_length=1, max_length=1000)
  regionIds: list[UUID] | None = Field(default=None, min_length=1, max_length=2048)
  glossaryDocument: dict = Field(default_factory=dict)
  wordRulesDocument: dict = Field(default_factory=dict)
  modelConfigSignature: str = Field(default='', max_length=128)


class Completion(Model):
  attemptId: UUID
  pageId: UUID
  translations: list[dict] = Field(default_factory=list, max_length=2048)
  error: str | None = Field(default=None, max_length=1000)


class ExportRequest(Model):
  kind: Literal['png', 'jpg', 'images', 'cbz', 'pdf', 'json', 'labelplus']
  pageIds: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)
  layer: Literal['source', 'clean', 'rendered'] = 'rendered'


class Ids(Model):
  projectIds: list[UUID] = Field(min_length=1, max_length=1000)


class Control(Model):
  action: Literal['pause', 'resume', 'cancel', 'retry']


class Attempt(Model):
  attemptId: UUID
  pageId: UUID

