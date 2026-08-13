pipeline {
    agent any

    environment {
        PYTHON = 'C:\\Users\\janar\\AppData\\Local\\Python\\bin\\python.exe'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out Gestura project...'
            }
        }

        stage('Setup Python') {
            steps {
                bat '"%PYTHON%" --version'
                bat '"%PYTHON%" -m pip --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat '"%PYTHON%" -m pip install -r requirements.txt'
            }
        }

        stage('Validate Project') {
            steps {
                bat '"%PYTHON%" -m py_compile server.py'
                bat '"%PYTHON%" -m py_compile desktop_app.py'
            }
        }
    }

    post {
        success {
            echo 'Gestura Jenkins automation completed successfully!'
        }

        failure {
            echo 'Gestura Jenkins automation failed.'
        }
    }
}
