from nola_translator_engine.compute import ComputeDevice, ComputeOptions, choose_devices


def test_preferred_gpu_with_insufficient_memory_retries_automatic_assignment():
    cpu = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu', recognition=True, translation=True)
    preferred = ComputeDevice('first', 'First GPU', 'cuda', torchDevice='cuda:0',
                              recognition=True, translation=True, totalMemoryMb=4096,
                              freeMemoryMb=100, score=100)
    available = ComputeDevice('second', 'Second GPU', 'cuda', torchDevice='cuda:1',
                              recognition=True, translation=True, totalMemoryMb=8192,
                              freeMemoryMb=7000, score=90)

    recognition, translation, reasons = choose_devices(
        [cpu, preferred, available], ComputeOptions(recognitionDevice='first'),
        1000, 1000, 'torch', 'qwen3-asr')

    assert recognition is available
    assert translation is available
    assert any('自动分配' in reason for reason in reasons)


def test_missing_preferred_gpu_retries_automatic_assignment():
    cpu = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu', recognition=True, translation=True)
    gpu = ComputeDevice('gpu', 'Available GPU', 'cuda', torchDevice='cuda:0',
                        recognition=True, translation=True, score=100)

    recognition, translation, reasons = choose_devices(
        [cpu, gpu], ComputeOptions(recognitionDevice='missing'),
        256, 256, 'torch', 'qwen3-asr')

    assert recognition is gpu
    assert translation is gpu
    assert any('自动分配' in reason for reason in reasons)
