pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out Gestura project...'
            }
        }

        stage('Setup Python') {
            steps {
                bat 'python --version'
                bat 'python -m pip --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'python -m pip install -r requirements.txt'
            }
        }

        stage('Validate Project') {
            steps {
                bat 'python -m py_compile server.py'
                bat 'python -m py_compile desktop_app.py'
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
