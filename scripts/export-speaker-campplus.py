"""Export official FunASR CAM++ weights for the bundled offline CPU runtime."""

from argparse import ArgumentParser
from hashlib import file_digest
from pathlib import Path

import numpy as np
import onnxruntime
import torch
from funasr.models.campplus.components import CAMLayer
from funasr.models.campplus.model import CAMPPlus

# https://huggingface.co/funasr/campplus/tree/e4b6ede7ce16997aff4ae69fbca1f0175e2afede
SOURCE_SHA256 = "3388cf5fd3493c9ac9c69851d8e7a8badcfb4f3dc631020c4961371646d5ada8"


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("weights", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.weights.open("rb") as weights:
        if file_digest(weights, "sha256").hexdigest() != SOURCE_SHA256:
            parser.error("weights do not match the pinned FunASR release")
    torch.set_num_threads(1)
    model = CAMPPlus().eval()
    model.load_state_dict(torch.load(args.weights, weights_only=True, map_location="cpu"))
    generator = torch.Generator().manual_seed(20261103)
    features = torch.randn(1, 148, 80, generator=generator)
    examples = (features, torch.randn(1, 148, 80, generator=generator))
    with torch.inference_mode():
        reference = [model(example).numpy() for example in examples]
    # The 74 post-stride frames fit into a single 100-frame CAM pooling segment.
    # ONNX AveragePool with ceil_mode does not preserve PyTorch's edge divisor.
    for layer in model.modules():
        if isinstance(layer, CAMLayer):
            layer.seg_pooling = lambda x: x.mean(-1, keepdim=True)
    torch.onnx.export(
        model, (features,), str(args.output), input_names=["features"],
        output_names=["embedding"], opset_version=17, dynamo=False,
    )
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = 1
    runtime = onnxruntime.InferenceSession(str(args.output), sess_options=options, providers=["CPUExecutionProvider"])
    for example, expected in zip(examples, reference, strict=True):
        actual, = runtime.run(None, {"features": example.numpy()})
        np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
    with args.output.open("rb") as output:
        print(f"ONNX SHA-256 {file_digest(output, 'sha256').hexdigest()}")


if __name__ == "__main__":
    main()
