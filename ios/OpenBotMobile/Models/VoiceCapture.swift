import AVFoundation
import Speech

@MainActor
final class VoiceCapture: NSObject, ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var transcript = ""
    @Published private(set) var errorMessage: String?

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var hasInputTap = false
    private var audioSessionIsActive = false

    func start() async {
        guard !isListening else { return }
        errorMessage = nil
        transcript = ""

        guard await speechPermission() else {
            errorMessage = "Allow Speech Recognition in Settings to turn your voice into text."
            return
        }
        guard await microphonePermission() else {
            errorMessage = "Allow Microphone access in Settings to record a message."
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: .current), recognizer.isAvailable else {
            errorMessage = "Voice typing isn’t available right now. You can still type your message."
            return
        }

        stopAudio()
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            audioSessionIsActive = true

            let nextRequest = SFSpeechAudioBufferRecognitionRequest()
            nextRequest.shouldReportPartialResults = true
            nextRequest.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            request = nextRequest

            task = recognizer.recognitionTask(with: nextRequest) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                        if result.isFinal {
                            self.finish()
                            self.task = nil
                            self.request = nil
                        }
                    } else if error != nil {
                        self.errorMessage = self.transcript.isEmpty
                            ? "I couldn’t hear that clearly. Tap the microphone and try again."
                            : nil
                        self.finish()
                        self.task = nil
                        self.request = nil
                    }
                }
            }

            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw VoiceCaptureError.noAudioInput
            }
            input.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak nextRequest] buffer, _ in
                nextRequest?.append(buffer)
            }
            hasInputTap = true
            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
        } catch {
            stopAudio()
            errorMessage = "The microphone didn’t start. Check your audio settings and try again."
        }
    }

    func finish() {
        guard isListening || audioEngine.isRunning else { return }
        request?.endAudio()
        stopAudio(cancelRecognition: false)
    }

    func cancel() {
        stopAudio(cancelRecognition: true)
    }

    func clearError() {
        errorMessage = nil
    }

    private func stopAudio(cancelRecognition: Bool = true) {
        if audioEngine.isRunning { audioEngine.stop() }
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        if cancelRecognition {
            task?.cancel()
            task = nil
            request = nil
        }
        isListening = false
        if audioSessionIsActive {
            audioSessionIsActive = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    private func speechPermission() async -> Bool {
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        return status == .authorized
    }

    private func microphonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission {
                continuation.resume(returning: $0)
            }
        }
    }
}

private enum VoiceCaptureError: Error {
    case noAudioInput
}
